"""
Generate a weekly summary from all sectors' key events.
Takes all_sectors_summary.json and creates a consolidated weekly report
highlighting the most significant market-moving events across all sectors.

Usage:
  python weekly_summary.py                           # Use default model and input
  python weekly_summary.py gemma3:4b                 # Specify model
  python weekly_summary.py gemma3:4b custom.json     # Specify model and input file

Output:
  weekly_summary.json - Consolidated weekly summary with top events
"""

import json
import os
import sys
import subprocess
import tempfile
import time
from datetime import datetime, timedelta


def load_all_sectors_data(input_file='all_sectors_summary.json'):
    """Load the combined sectors summary file."""
    print(f"Loading {input_file}...")
    
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    metadata = data.get('metadata', {})
    sectors = data.get('sectors', {})
    
    print(f"Loaded {len(sectors)} sectors")
    print(f"Generated: {metadata.get('generated_date', 'unknown')}")
    print(f"Total key events: {metadata.get('total_key_events', 'unknown')}")
    
    return data


def collect_all_key_events(data):
    """Collect all key events from all sectors with sector context."""
    all_events = []
    sectors = data.get('sectors', {})
    
    for sector_id, sector_data in sectors.items():
        key_events = sector_data.get('key_events', [])
        ticker_count = sector_data.get('ticker_count', 0)
        
        for event in key_events:
            all_events.append({
                'sector_id': sector_id,
                'ticker_count': ticker_count,
                'date': event.get('date', 'unknown'),
                'event': event.get('event', ''),
                'rank': event.get('rank', 99),  # sector-level rank
                'impact_score': event.get('impact_score', 'medium')
            })
    
    # Sort by impact_score (high first) then by rank
    impact_order = {'high': 0, 'medium': 1, 'low': 2}
    all_events.sort(key=lambda x: (impact_order.get(x['impact_score'], 1), x['rank']))
    
    print(f"Collected {len(all_events)} total key events from all sectors")
    print(f"  High impact: {sum(1 for e in all_events if e['impact_score'] == 'high')}")
    print(f"  Medium impact: {sum(1 for e in all_events if e['impact_score'] == 'medium')}")
    print(f"  Low impact: {sum(1 for e in all_events if e['impact_score'] == 'low')}")
    return all_events


def call_ollama(prompt, model_name, timeout=1800):
    """Helper function to call Ollama model."""
    try:
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt', encoding='utf-8') as temp_file:
            temp_file.write(prompt)
            temp_prompt_path = temp_file.name
        
        env = os.environ.copy()
        env['OLLAMA_GPU_LAYERS'] = 'all'
        env['CUDA_VISIBLE_DEVICES'] = '0'
        
        with open(temp_prompt_path, 'r', encoding='utf-8') as f:
            result = subprocess.run(
                ['ollama', 'run', model_name, '--verbose'],
                stdin=f,
                capture_output=True,
                text=True,
                encoding='utf-8',
                timeout=timeout,
                env=env
            )
        
        try:
            os.unlink(temp_prompt_path)
        except:
            pass
        
        if result.returncode != 0:
            return None
        
        return result.stdout.strip()
        
    except Exception as e:
        print(f"Error calling Ollama: {e}")
        return None


def parse_json_response(response_text):
    """Extract JSON from model response."""
    if not response_text:
        return None
        
    if '```' in response_text:
        lines = response_text.split('\n')
        json_lines = []
        in_json = False
        for line in lines:
            if '```' in line:
                in_json = not in_json
                continue
            if in_json or (line.strip().startswith('{') or json_lines):
                json_lines.append(line)
        response_text = '\n'.join(json_lines)
    
    start_idx = response_text.find('{')
    end_idx = response_text.rfind('}') + 1
    
    if start_idx != -1 and end_idx > start_idx:
        json_str = response_text[start_idx:end_idx]
        return json.loads(json_str)
    
    return None


def generate_weekly_summary(all_events, model_name="gemma3:4b"):
    """Use TWO-STAGE LLM pipeline to generate deduplicated weekly summary."""
    
    # Calculate actual date range from events
    dates = []
    for event in all_events:
        date_str = event.get('date', '')
        if date_str and date_str != 'unknown' and date_str != 'Unknown':
            try:
                # Parse various date formats (YYYY-MM-DD, YYYY-MM, YYYY)
                if len(date_str) == 10:  # YYYY-MM-DD
                    dates.append(datetime.strptime(date_str, '%Y-%m-%d'))
                elif len(date_str) == 7:  # YYYY-MM
                    dates.append(datetime.strptime(date_str + '-01', '%Y-%m-%d'))
                elif len(date_str) == 4:  # YYYY
                    dates.append(datetime.strptime(date_str + '-01-01', '%Y-%m-%d'))
            except:
                pass
    
    if dates:
        min_date = min(dates)
        max_date = max(dates)
        week_period = f"{min_date.strftime('%B %d')} - {max_date.strftime('%B %d, %Y')}"
    else:
        week_period = f"Week of {datetime.now().strftime('%B %d, %Y')}"
    
    # Prepare events for the prompt - include rank and impact score from sector analysis
    events_text = ""
    for idx, event in enumerate(all_events, 1):
        impact = event.get('impact_score', 'medium').upper()
        sector_rank = event.get('rank', 99)
        events_text += f"{idx}. [IMPACT: {impact}] [SECTOR RANK: {sector_rank}] [Sector {event['sector_id']}] ({event['date']}): {event['event']}\n\n"
    
    # Count by impact score
    high_impact_count = sum(1 for e in all_events if e.get('impact_score') == 'high')
    medium_impact_count = sum(1 for e in all_events if e.get('impact_score') == 'medium')
    
    # ========== STAGE 1: Generate initial summary ==========
    stage1_prompt = f"""You are a SENIOR FINANCIAL ADVISOR at a major investment bank, preparing the weekly market intelligence briefing for portfolio managers and institutional clients.

## YOUR ROLE:
- Identify market-moving events that affect investment decisions
- Prioritize by DOLLAR IMPACT (billions > millions > thousands)
- Focus on actionable intelligence: acquisitions, earnings, regulatory changes, leadership shifts

## INPUT DATA:
{len(all_events)} events from {len(set(e['sector_id'] for e in all_events))} sectors
- HIGH impact events: {high_impact_count} (prioritize these!)
- MEDIUM impact events: {medium_impact_count}

Events are PRE-RANKED by sector analysts:
- [IMPACT: HIGH] = Major market mover, significant $ amounts
- [IMPACT: MEDIUM] = Notable development
- [IMPACT: LOW] = Minor news
- [SECTOR RANK: 1] = Top event in that sector

## EVENTS:
{events_text}

## YOUR TASK AS FINANCIAL ADVISOR:
1. SELECT 8-12 most investment-relevant events
2. PRIORITIZE: [IMPACT: HIGH] events first, then by SECTOR RANK
3. PRIORITIZE: Bigger dollar amounts over smaller ones
4. IGNORE: Routine appointments, minor product updates unless no better options
5. NO DUPLICATES: Each company/person should appear MAX ONCE

## OUTPUT FORMAT:
{{
  "report_type": "weekly_market_intelligence",
  "week_period": "{week_period}",
  "executive_summary": "2-3 paragraphs for portfolio managers. Lead with biggest $ moves. Include specific company names and amounts.",
  "top_events": [
    {{
      "rank": 1,
      "category": "M&A/Earnings/Leadership/Regulatory/Funding",
      "headline": "Short impactful headline",
      "details": "Include WHO, WHAT, HOW MUCH ($XXM/$XXB), and WHY it matters",
      "market_impact": "high/medium/low",
      "investment_implication": "Brief note on portfolio implications"
    }}
  ],
  "sector_highlights": ["Most active sectors"],
  "themes": ["Emerging themes across sectors"]
}}

Output ONLY valid JSON:"""

    print(f"\n{'='*60}")
    print(f"STAGE 1: Generating market intelligence report using {model_name}...")
    print(f"Processing {len(all_events)} events ({high_impact_count} high impact)...")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}")
    
    start_time = time.time()
    stage1_response = call_ollama(stage1_prompt, model_name)
    stage1_time = time.time() - start_time
    print(f"Stage 1 completed in {stage1_time:.1f}s")
    
    if not stage1_response:
        print("Error: Stage 1 failed")
        return None
    
    stage1_summary = parse_json_response(stage1_response)
    if not stage1_summary:
        print("Error: Could not parse Stage 1 response")
        return None
    
    stage1_events = stage1_summary.get('top_events', [])
    print(f"Stage 1 produced {len(stage1_events)} events")
    
    # Force correct week_period (model may have overwritten it)
    stage1_summary['week_period'] = week_period
    
    # ========== STAGE 2: Deduplicate ==========
    # Extract entities from Stage 1 events for checking
    entities_count = {}
    for ev in stage1_events:
        headline = ev.get('headline', '')
        details = ev.get('details', '')
        text = (headline + ' ' + details).upper()
        # Extract potential company/person names (words that appear capitalized)
        words = headline.split()
        for word in words:
            clean_word = word.strip('.,!?()[]"\'')
            if len(clean_word) > 2 and clean_word[0].isupper():
                entities_count[clean_word] = entities_count.get(clean_word, 0) + 1
    
    # Find entities mentioned more than once
    repeated_entities = [k for k, v in entities_count.items() if v > 1]
    
    stage2_prompt = f"""You are a senior editor at a financial research firm performing quality control.

CURRENT LIST OF {len(stage1_events)} EVENTS FOR THE WEEKLY BRIEFING:
{json.dumps(stage1_events, indent=2)}

## DEFINITION OF DUPLICATE:
Two events are duplicates ONLY if they describe the EXACT SAME underlying fact:
- Same company + same announcement = DUPLICATE
- Same person + same statement = DUPLICATE
- Same dollar amount reported twice = DUPLICATE
- Same numbers reported twice = DUPLICATE

## NOT DUPLICATES (keep both):
- Same company but DIFFERENT news topics
- Same topic but DIFFERENT dollar amounts  
- Company announcement vs CEO quote about different aspects
- Stock price move vs business development news

## ENTITIES APPEARING MULTIPLE TIMES: {repeated_entities}
Check each: Are they TRUE duplicates (same fact) or different news about same entity?

## TASK:
1. Compare events mentioning same entity
2. If SAME underlying fact -> remove less detailed one
3. If DIFFERENT facts -> keep both
4. Re-rank 1 to N (highest impact = rank 1)
5. Preserve investment_implication field if present

## OUTPUT:
{{
  "top_events": [
    {{"rank": 1, "category": "...", "headline": "...", "details": "...", "market_impact": "high/medium/low", "investment_implication": "..."}}
  ],
  "duplicates_removed": ["headline removed"],
  "kept_as_different": ["similar but different news"]
}}

Output ONLY valid JSON:"""

    print(f"\n{'='*60}")
    print(f"STAGE 2: Deduplicating events...")
    print(f"{'='*60}")
    
    start_time = time.time()
    stage2_response = call_ollama(stage2_prompt, model_name)
    stage2_time = time.time() - start_time
    print(f"Stage 2 completed in {stage2_time:.1f}s")
    
    if stage2_response:
        stage2_result = parse_json_response(stage2_response)
        if stage2_result and 'top_events' in stage2_result:
            deduped_events = stage2_result['top_events']
            removed = stage2_result.get('duplicates_removed', [])
            print(f"Stage 2: {len(stage1_events)} -> {len(deduped_events)} events")
            if removed:
                print(f"Removed duplicates: {removed}")
            
            # Update the summary with deduplicated events
            stage1_summary['top_events'] = deduped_events
    
    # Ensure required fields
    stage1_summary['generated_date'] = datetime.now().strftime('%Y-%m-%d')
    stage1_summary['report_type'] = 'weekly_summary'
    
    return stage1_summary


def save_weekly_summary(summary, output_file='weekly_summary.json'):
    """Save the weekly summary to a JSON file."""
    
    print(f"\nSaving weekly summary to {output_file}...")
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    
    print(f"✓ Saved to {output_file}")
    
    # Print summary stats
    top_events = summary.get('top_events', [])
    print(f"\n📊 WEEKLY SUMMARY STATS:")
    print(f"   Top events: {len(top_events)}")
    
    if top_events:
        categories = {}
        for event in top_events:
            cat = event.get('category', 'Other')
            categories[cat] = categories.get(cat, 0) + 1
        print(f"   Categories: {categories}")
    
    return output_file


def print_executive_summary(summary):
    """Print the executive summary to console."""
    print("\n" + "="*60)
    print("EXECUTIVE SUMMARY")
    print("="*60)
    
    exec_summary = summary.get('executive_summary', 'No summary available')
    print(exec_summary)
    
    print("\n" + "="*60)
    print("TOP EVENTS")
    print("="*60)
    
    for event in summary.get('top_events', [])[:5]:
        rank = event.get('rank', '?')
        headline = event.get('headline', 'No headline')
        category = event.get('category', 'Unknown')
        print(f"\n#{rank} [{category}] {headline}")
        print(f"   {event.get('details', '')[:200]}...")
    
    print("\n" + "="*60)


def main():
    """Main function to generate weekly summary."""
    
    # Parse arguments
    model_name = sys.argv[1] if len(sys.argv) > 1 else "gemma3:4b"
    input_file = sys.argv[2] if len(sys.argv) > 2 else "all_sectors_summary.json"
    
    print(f"{'='*60}")
    print(f"WEEKLY SUMMARY GENERATOR")
    print(f"{'='*60}")
    print(f"Model: {model_name}")
    print(f"Input: {input_file}")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}")
    
    # Check if input file exists
    if not os.path.exists(input_file):
        print(f"Error: Input file '{input_file}' not found!")
        print("Run batch_process_sectors.py first to generate all_sectors_summary.json")
        return
    
    # Load data
    data = load_all_sectors_data(input_file)
    
    # Collect all events
    all_events = collect_all_key_events(data)
    
    if not all_events:
        print("Error: No key events found in the input file!")
        return
    
    # Generate weekly summary
    summary = generate_weekly_summary(all_events, model_name)
    
    if not summary:
        print("Error: Failed to generate weekly summary!")
        return
    
    # Add metadata from source
    summary['source_metadata'] = data.get('metadata', {})
    summary['total_events_analyzed'] = len(all_events)
    
    # Save results
    save_weekly_summary(summary)
    
    # Print executive summary
    print_executive_summary(summary)
    
    print(f"\n✓ Weekly summary generation complete!")
    print(f"Output saved to: weekly_summary.json")


if __name__ == "__main__":
    main()
