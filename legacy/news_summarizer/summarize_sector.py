"""
Extract any sector from sectors_summary.json OR process a text file with summaries.
Outputs results in JSON format with sector_id, summary, and generated_date.
Usage: 
  python summarize_sector.py <sector_id>          # Process sector from JSON
  python summarize_sector.py <file_path>          # Process text file directly
Examples:
  python summarize_sector.py 6
  python summarize_sector.py factor.txt
"""

import json
import subprocess
import time
import os
import sys
import csv
import random
import tempfile
from datetime import datetime, timedelta



def is_file_path(input_str):
    """Check if input is a file path."""
    return os.path.isfile(input_str) or '.' in input_str

def extract_sector(sector_id, input_file='sectors_summary.json'):
    """Extract specific sector data from the JSON file."""
    print(f"Reading {input_file}...")
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    sector_data = data.get(sector_id, {})
    
    if not sector_data:
        print(f"Error: Sector {sector_id} not found in the data!")
        return None
    
    print(f"Found sector {sector_id} with {sector_data.get('ticker_count', 0)} tickers")
    return sector_data

def load_text_file(file_path):
    """Load summaries from a text file."""
    print(f"Reading text file: {file_path}...")
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Try to parse as JSON first
        try:
            data = json.loads(content)
            # If it's a sector data structure
            if 'tickers' in data:
                return data, os.path.splitext(os.path.basename(file_path))[0]
            # If it's just text
            else:
                return {'raw_text': content}, os.path.splitext(os.path.basename(file_path))[0]
        except json.JSONDecodeError:
            # Plain text file
            return {'raw_text': content}, os.path.splitext(os.path.basename(file_path))[0]
    except Exception as e:
        print(f"Error reading file: {e}")
        return None, None

def collect_summaries(sector_data):
    """Collect all summary_long texts from tickers in the sector or from raw text."""
    summaries = []
    
    # Check if it's raw text
    if 'raw_text' in sector_data:
        raw_text = sector_data['raw_text']
        
        # Try to detect if it's CSV format
        lines = raw_text.split('\n')
        if lines and ',' in lines[0]:
            # Likely CSV - try to parse it
            try:
                csv_reader = csv.DictReader(lines)
                for idx, row in enumerate(csv_reader):
                    # Look for text columns (common names: text, article, summary, content, etc.)
                    text_content = None
                    for key in row.keys():
                        if any(term in key.lower() for term in ['text', 'article', 'summary', 'content', 'body']):
                            text_content = row[key]
                            break
                    
                    # If no text column found, join all values
                    if not text_content:
                        text_content = ' '.join([v for v in row.values() if v])
                    
                    if text_content and len(text_content) > 50:
                        summaries.append({
                            'ticker': f'Article_{idx+1}',
                            'title': row.get('title', row.get('Title', 'CSV Entry')),
                            'summary': text_content.strip()
                        })
                print(f"Collected {len(summaries)} entries from CSV file")
                return summaries
            except Exception as e:
                print(f"CSV parsing failed, treating as plain text: {e}")
        
        # Plain text - split by lines or paragraphs
        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
        for idx, line in enumerate(lines):
            if len(line) > 50:  # Only include substantial lines
                summaries.append({
                    'ticker': f'Item_{idx+1}',
                    'title': 'Text Entry',
                    'summary': line
                })
        print(f"Collected {len(summaries)} text entries from raw text")
        return summaries
    
    # Otherwise process as sector data with tickers
    tickers = sector_data.get('tickers', {})
    
    for ticker_symbol, ticker_data in tickers.items():
        ticker_summaries = ticker_data.get('summaries', [])
        for summary in ticker_summaries:
            summary_long = summary.get('summary_long', '').strip()
            publication_date = summary.get('publication_date', '')
            if summary_long:
                summaries.append({
                    'ticker': ticker_symbol,
                    'title': ticker_data.get('title', 'N/A'),
                    'summary': summary_long,
                    'publication_date': publication_date
                })
    
    print(f"Collected {len(summaries)} summaries from {len(tickers)} tickers")
    return summaries

def deduplicate_summaries(summaries):
    """
    Remove duplicate summaries based on content.
    
    Args:
        summaries: List of summary dictionaries
    
    Returns:
        List of unique summaries
    """
    original_count = len(summaries)
    
    # Remove exact duplicates based on summary text
    seen_summaries = set()
    unique_summaries = []
    
    for item in summaries:
        summary_text = item['summary'].strip().lower()
        # Create a hash of the summary for comparison
        if summary_text not in seen_summaries:
            seen_summaries.add(summary_text)
            unique_summaries.append(item)
    
    duplicates_removed = original_count - len(unique_summaries)
    if duplicates_removed > 0:
        print(f"\n🔍 Deduplication: Removed {duplicates_removed} duplicate summaries")
        print(f"   Remaining unique summaries: {len(unique_summaries)}")
    
    return unique_summaries

def check_gpu_support():
    """Check if Ollama is using GPU."""
    print("\n🖥️  Checking GPU support...")
    try:
        result = subprocess.run(
            ['ollama', 'list'],
            capture_output=True,
            text=True,
            encoding='utf-8',
            timeout=5
        )
        print("✓ Ollama is running")
        return True
    except:
        print("⚠️  Ollama may not be running.")
        return False

def create_sector_summary_with_llm(summaries, sector_id, model_name="gemma3:1b"):
    """Use a local LLM via Ollama to create a sector-level summary with JSON output."""
    
    check_gpu_support()
    
    print(f"\nPreparing context from all {len(summaries)} summaries...")
    start_prep = time.time()
    
    context = f"Here are {len(summaries)} company summaries from Sector {sector_id}:\n\n"
    for idx, item in enumerate(summaries, 1):
        pub_date = item.get('publication_date', '')
        if pub_date:
            # Extract just the date part (YYYY-MM-DD)
            pub_date_short = pub_date.split(' ')[0] if ' ' in pub_date else pub_date
            context += f"{idx}. [{pub_date_short}] {item['ticker']} ({item['title']}): {item['summary']}\n\n"
        else:
            context += f"{idx}. {item['ticker']} ({item['title']}): {item['summary']}\n\n"
        if idx % 100 == 0:
            print(f"  Processed {idx}/{len(summaries)} summaries...")
    
    prep_time = time.time() - start_prep
    print(f"✓ Context preparation completed in {prep_time:.2f} seconds")
    
    prompt = f"""Take a deep breath.

# AI Summarization Prompt for Financial/Market Data

Your task is to produce a precise, fact-focused summary of the provided sector information. The input contains summaries of multiple companies and statements from officials/analysts. **CRITICAL: You must consolidate overlaps and aggressively remove all repetition. Do not include multiple sentences that have the same meaning.** Use only information present in the text—do not infer or add external facts.

## CRITICAL PRIORITY: Focus on HIGH-IMPACT, MARKET-MOVING information:
- Direct quotes and statements from named individuals (CEOs, Fed officials, regulators, analysts, celebrities, influencers)
- Specific regulatory announcements, policy changes, or legal actions
- Concrete financial figures, valuations, deal terms, earnings surprises
- Uncertainty language: "not 100% certain", "may", "might", "possibly", "unlikely", "expected to"
- Probability assessments and confidence levels when mentioned
- Conditional statements: "if X happens, then Y"
- Tentative policy positions subject to change

## What to PRIORITIZE (in order):
1.  **M&A (Mergers & Acquisitions)** — Deal amounts, valuations, financing details, timelines, strategic rationale
2.  **Leadership changes** — CEO/CFO/executive moves, appointments, departures with reasons and market reaction
3.  **Earnings & Financial Outlook** — Actual vs expected results, guidance changes, revenue surprises, margin shifts
4.  **Legal & Regulatory matters** — Lawsuits, investigations, penalties with amounts, regulatory approvals/rejections
5.  **New Products & Technology** — Product launches with revenue impact, patents, innovations, market positioning
6.  **Thematic Trends** — AI developments, ESG initiatives, crypto/blockchain, recession indicators, sector shifts
7.  **Regulatory changes** — New laws, sanctions, compliance requirements affecting specific sectors/companies
8.  **Insider transactions** — Significant insider buying/selling, size, direction, timing, context
9.  **Macroeconomic factors** — Interest rates, inflation, FX movements, geopolitical tensions affecting specific companies
10. **Named person statements** — Direct quotes from executives, officials, analysts with attribution and uncertainty language

## What to AVOID:
- Generic sector trends without specific companies/numbers
- Vague statements like "companies are facing challenges"
- Broad thematic observations without concrete facts
- Routine operational updates without material impact

## Attribution & Nuance:
- ALWAYS include WHO said/announced something (full name if available). Preserve the exact degree of certainty/uncertainty.
- Prioritize individuals who appear frequently in the data.
- Explicitly capture drivers and attribution. Preserve numbers, units, currencies, tickers, timeframes exactly as written (no conversions). If conflicting figures exist, note the discrepancy or range.

---
## Inputs:
Sector {sector_id} contains {len(summaries)} company summaries.

**CRITICAL INSTRUCTION:** Scan ALL {len(summaries)} summaries for:
- Any mention of named individuals (executives, officials, analysts, influencers)
- Specific dollar amounts, percentages, dates
- Direct quotes or paraphrased statements
- Policy announcements or regulatory changes

IMPORTANT: You MUST analyze the ACTUAL data provided below. Do not generate generic market commentary.

{context}
---

## CRITICAL FINAL CHECK BEFORE OUTPUT - ZERO TOLERANCE FOR DUPLICATES

Before generating output, I MUST verify:
1. **Company Check:** Does ANY company name appear in MORE than ONE event? If yes, MERGE into ONE event.
2. **Person Check:** Does ANY person's name appear in MORE than ONE event? If yes, MERGE into ONE event.  
3. **Topic Check:** Do ANY two events describe the SAME deal/announcement/action? If yes, KEEP only the MOST detailed one.
4. **Semantic Check:** Could ANY two events be describing the SAME underlying fact with different words? If yes, DELETE the duplicate.

Examples of DUPLICATES that must be merged:
- "Redwire received contract from Axiom" AND "Axiom awarded contract to Redwire" = SAME EVENT
- "Lisa Su confirmed AMD deal" AND "AMD CEO discussed agreement" = SAME EVENT
- "Jensen Huang stated Blackwell demand" AND "NVIDIA CEO commented on chip sales" = SAME EVENT

**IF I GENERATE DUPLICATES, MY OUTPUT IS INVALID AND WILL BE REJECTED.**

## Output Format

Return only valid RFC 8259 JSON with exactly THREE fields in this order:

- **sector_id** — echo the sector_id exactly as given: "{sector_id}"
- **generated_date** — use today's date in YYYY-MM-DD format
- **key_events** — an array of objects, each with "date" and "event" fields. Each event must be distinct and high-impact. Include: (1) Named person/company, (2) Specific action/statement, (3) Numbers/dates, (4) Context. Prioritize frequently-mentioned individuals.

No other fields. No code fences or extra text.

## Example Output Format
**Note:** Use ACTUAL names/data from input, not these examples.

```json
{{
    "sector_id": "{sector_id}",
    "generated_date": "{datetime.now().strftime('%Y-%m-%d')}",
    "key_events": [
        {{"date": "2025-10-08", "event": "Person's name stated specific action with numbers/dates, including context and impact."}},
        {{"date": "2025-10-06", "event": "Company's name reported metric of X amount on date, showing Y% change driven by reason."}},
        {{"date": "2025-10-03", "event": "Official's name indicated 'uncertainty language' regarding topic, suggesting implication."}}
    ]
}}
```

## Key Points to Remember
- **CRITICAL: NO REPETITION** - The summary must be de-duplicated. Each of the key_events **must be unique in meaning**. Do not repeat the same fact.
- **CRITICAL: SINGLE STRING** - Each of the events must be a single JSON string, not broken into multiple lines or array elements.
- **NO BRACKETS** - Do not wrap the output strings in `[` or `]` characters.
- **Real names only** - no placeholders like "Company A" or "Executive B"
- **Preserve uncertainty** - "may", "not certain", "possibly", "expects to"
- **Numbers matter** - include all dollar amounts, percentages, dates
- **Attribution is critical** - always say WHO made the statement
- **Frequently mentioned = important** - if someone appears many times in the data, they MUST be in key_events"""
    
    print(f"\n{'='*60}")
    print(f"Generating sector summary using local LLM via Ollama...")
    print(f"Using model: {model_name}")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("This may take several minutes depending on your hardware...")
    print(f"{'='*60}")
    
    start_time = time.time()
    
    try:
        print("\n⏳ Running model inference on GPU...")
        inference_start = time.time()
        
        env = os.environ.copy()
        env['OLLAMA_GPU_LAYERS'] = 'all'
        env['CUDA_VISIBLE_DEVICES'] = '0'
        
        import tempfile
        temp_file = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt', encoding='utf-8')
        temp_file.write(prompt)
        temp_file.close()
        
        with open(temp_file.name, 'r', encoding='utf-8') as f:
            result = subprocess.run(
                ['ollama', 'run', model_name, '--verbose'],
                stdin=f,
                capture_output=True,
                text=True,
                encoding='utf-8',
                timeout=1800,
                env=env
            )
        
        try:
            os.unlink(temp_file.name)
        except:
            pass
        
        inference_time = time.time() - inference_start
        total_time = time.time() - start_time
        
        if result.returncode != 0:
            print(f"Error running Ollama: {result.stderr}")
            return None
        
        print(f"\n✓ Model inference completed in {inference_time:.2f} seconds ({timedelta(seconds=int(inference_time))})")
        print(f"✓ Total generation time: {total_time:.2f} seconds ({timedelta(seconds=int(total_time))})")
        
        response_text = result.stdout.strip()
        
        try:
            # Remove markdown code fences if present
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
                sector_summary = json.loads(json_str)
                
                # Check if summary contains nested JSON (model mistake)
                if "summary" in sector_summary and isinstance(sector_summary["summary"], str):
                    summary_text = sector_summary["summary"]
                    # Try to detect JSON in summary (even with escaped quotes)
                    # Check for actual newline escape sequences or JSON structure
                    has_escape_sequences = ('\\n' in repr(summary_text) and summary_text.count('\n') > 2)
                    has_json_structure = (summary_text.strip().startswith('{') or 
                                         '```json' in summary_text or 
                                         '"sector_id"' in summary_text or
                                         '"generated_date"' in summary_text or
                                         '"key_events"' in summary_text)
                    
                    if has_escape_sequences or has_json_structure:
                        print("⚠ Detected nested JSON in summary field, extracting...")
                        
                        # Extract nested JSON
                        if '```json' in summary_text:
                            summary_text = summary_text.split('```json')[1].split('```')[0]
                        
                        # Find JSON boundaries
                        start_idx = summary_text.find('{')
                        end_idx = summary_text.rfind('}') + 1
                        
                        if start_idx != -1 and end_idx > start_idx:
                            json_text = summary_text[start_idx:end_idx]
                            
                            # Try to parse
                            nested_json = None
                            try:
                                # First try: load as-is
                                nested_json = json.loads(json_text)
                            except:
                                try:
                                    # Second try: it might be escaped, use json.loads to unescape
                                    # The summary field itself is a JSON string containing JSON
                                    nested_json = json.loads(summary_text)
                                except:
                                    try:
                                        # Third try: decode unicode escapes
                                        unescaped = json_text.encode().decode('unicode_escape')
                                        nested_json = json.loads(unescaped)
                                    except:
                                        print("⚠ Could not parse nested JSON")
                                        nested_json = None
                            
                            if nested_json and isinstance(nested_json, dict):
                                # Use nested JSON, but keep the original sector_id from outer JSON
                                original_sector_id = sector_summary.get("sector_id", sector_id)
                                sector_summary = nested_json
                                # Ensure we use the correct sector_id (from input parameter)
                                sector_summary["sector_id"] = original_sector_id
                                print("✓ Successfully extracted and parsed nested JSON from summary field")

                
                # Ensure all required fields
                if "sector_id" not in sector_summary:
                    sector_summary["sector_id"] = sector_id
                if "generated_date" not in sector_summary:
                    sector_summary["generated_date"] = datetime.now().strftime('%Y-%m-%d')
                if "key_events" not in sector_summary:
                    sector_summary["key_events"] = []
                    
                return sector_summary
            else:
                print("Warning: No JSON found in response, returning raw text")
                return {
                    "sector_id": sector_id,
                    "generated_date": datetime.now().strftime('%Y-%m-%d'),
                    "summary": response_text,
                    "key_events": []
                }
        except json.JSONDecodeError as e:
            print(f"Warning: Could not parse JSON response: {e}")
            print("Returning raw response as summary")
            return {
                "sector_id": sector_id,
                "generated_date": datetime.now().strftime('%Y-%m-%d'),
                "summary": response_text,
                "key_events": []
            }
    
    except FileNotFoundError:
        print("Error: Ollama not found!")
        return None
    except subprocess.TimeoutExpired:
        print("Error: Model took too long to respond")
        return None
    except Exception as e:
        print(f"Error running local model: {e}")
        return None

def consolidate_key_events(key_events, sector_id, model_name="gemma3:1b"):
    """
    Stage 2: Quality control and deduplication of key events.
    Takes the key_events array from Stage 1 and:
    - Removes duplicate events
    - Validates event quality and relevance
    - Filters out generic/low-value events
    """
    
    print(f"Quality checking {len(key_events)} key events...")
    
    # Create the Stage 2 prompt
    prompt = f"""You are performing quality control on extracted key events from financial news.

Your task:
1. DEDUPLICATE: Remove events that describe the EXACT SAME occurrence (even if worded differently)
2. VALIDATE: Keep only high-quality, specific, fact-based events
3. FILTER: Remove generic statements without concrete facts

INPUT DATA:
{json.dumps(key_events, indent=2, ensure_ascii=False)}

## AGGRESSIVE DEDUPLICATION - ZERO TOLERANCE

You MUST check EVERY event against EVERY other event:

1. **COMPANY NAME CHECK:** If company X appears in events #1 and #3 → DUPLICATE, keep only one
2. **PERSON NAME CHECK:** If person Y appears in events #2 and #5 → DUPLICATE, keep only one  
3. **TOPIC CHECK:** If topic Z (e.g., "contract", "acquisition", "earnings") appears twice → DUPLICATE
4. **SEMANTIC CHECK:** If two events could answer the same question → DUPLICATE

Examples - ALL of these are DUPLICATES:
- "Redwire received contract" + "Redwire's contract from Axiom" = SAME (Redwire appears twice)
- "Jensen Huang stated demand" + "NVIDIA CEO commented" = SAME (same person, different title)
- "AMD chip deal" + "Lisa Su confirmed AMD agreement" = SAME (AMD topic twice)
- "Shares jumped 4.2%" + "Stock rose after announcement" = SAME (same market reaction)

**FINAL COUNT MUST BE LOWER THAN INPUT COUNT** - if you return same number of events, you failed.

Keep ONLY the MOST detailed version of each unique fact.

QUALITY VALIDATION:
KEEP events that have:
- Named individuals with specific statements/actions
- Concrete numbers, dates, percentages
- Specific company/regulatory actions
- Uncertainty language with attribution ("X said it may...", "Y believes it could...")

REMOVE events that are:
- Generic sector trends without specifics
- Vague statements without attribution
- Duplicate information (including semantic duplicates)
- Low-impact routine operations

CRITICAL: You are NOT generating a summary. Output only validated key_events array.

Output Format:
Return only valid RFC 8259 JSON with exactly THREE fields:
- sector_id: "{sector_id}"
- generated_date: current date in YYYY-MM-DD format
- key_events: array of validated, deduplicated events

Each key_event must have:
- date: "YYYY-MM-DD" (or "YYYY-MM" if day unknown, or "YYYY" if month unknown)
- event: detailed description (preserve attribution, uncertainty, specific numbers)

Example output structure (DO NOT copy content, validate from ACTUAL data):
{{
  "sector_id": "{sector_id}",
  "generated_date": "{datetime.now().strftime('%Y-%m-%d')}",
  "key_events": [
    {{"date": "2025-10-08", "event": "Specific validated event..."}}
  ]
}}

CRITICAL: 
- Output validated events from INPUT DATA above, not from example
- NO summary field in output
- Focus on deduplication and quality, not reducing count
- If event is high-quality and unique, KEEP it
"""
    
    try:
        print("  Calling Ollama API (Stage 2)...")
        
        # Create temporary file for prompt
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt', encoding='utf-8') as temp_file:
            temp_file.write(prompt)
            temp_prompt_path = temp_file.name
        
        try:
            env = os.environ.copy()
            env['OLLAMA_GPU_LAYERS'] = 'all'
            env['CUDA_VISIBLE_DEVICES'] = '0'
            
            cmd = ['ollama', 'run', model_name, '-']
            
            with open(temp_prompt_path, 'r', encoding='utf-8') as f:
                prompt_content = f.read()
            
            result = subprocess.run(
                cmd,
                input=prompt_content,
                capture_output=True,
                text=True,
                encoding='utf-8',
                timeout=300,
                env=env
            )
            
        finally:
            try:
                os.unlink(temp_prompt_path)
            except:
                pass
        
        if result.returncode != 0:
            print(f"Error: Ollama command failed with code {result.returncode}")
            print(f"stderr: {result.stderr}")
            return None
        
        response_text = result.stdout.strip()
        
        if not response_text:
            print("Error: Empty response from model")
            return None
        
        print(f"  ✓ Received response from model ({len(response_text)} chars)")
        
        # Parse JSON response (same logic as Stage 1)
        if '```json' in response_text or '```' in response_text:
            json_lines = []
            in_json = False
            lines = response_text.split('\n')
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
            consolidated_output = json.loads(json_str)
            
            # Validate output structure - NO SUMMARY in Stage 2
            if not all(k in consolidated_output for k in ['sector_id', 'generated_date', 'key_events']):
                print("Warning: Missing required fields in Stage 2 output")
                return None
            
            print(f"  ✓ Stage 2 complete - {len(consolidated_output['key_events'])} validated events")
            return consolidated_output
        else:
            print("Error: Could not find JSON structure in Stage 2 response")
            return None
            
    except subprocess.TimeoutExpired:
        print("Error: Stage 2 model took too long to respond")
        return None
    except Exception as e:
        print(f"Error in Stage 2: {e}")
        return None

def save_results(sector_id, sector_summary, output_file=None):
    """Save the sector key events in JSON format (no summary)."""
    
    if output_file is None:
        output_file = f'sector_{sector_id}_summary.json'
    
    if isinstance(sector_summary, str):
        try:
            sector_summary = json.loads(sector_summary)
        except json.JSONDecodeError:
            sector_summary = {
                "sector_id": sector_id,
                "generated_date": datetime.now().strftime('%Y-%m-%d'),
                "key_events": []
            }
    
    output = {
        "sector_id": sector_id,
        "generated_date": sector_summary.get("generated_date", datetime.now().strftime('%Y-%m-%d')),
        "key_events": sector_summary.get("key_events", [])
    }
    
    print(f"\nSaving results to {output_file}...")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"✓ Saved to {output_file}")

def main():
    """Main execution function."""
    overall_start = time.time()
    
    # Get sector ID or file path from command line argument
    if len(sys.argv) > 1:
        input_arg = sys.argv[1]
    else:
        print("Usage: python summarize_sector.py <sector_id_or_file_path> [model_name]")
        print("Examples:")
        print("  python summarize_sector.py 6")
        print("  python summarize_sector.py factor.txt")
        print("  python summarize_sector.py factor.txt phi3:mini")
        print("\nNo input provided, using default: 6")
        input_arg = "6"
    
    # Get optional model name parameter
    model_name = sys.argv[2] if len(sys.argv) > 2 else "gemma3:1b"
    
    # Determine if input is a file or sector ID
    if is_file_path(input_arg):
        # Process file
        sector_data, sector_id = load_text_file(input_arg)
        if not sector_data:
            print(f"Error: Could not load file {input_arg}")
            return
        input_type = "file"
        print(f"Processing file: {input_arg}")
    else:
        # Process sector ID
        sector_id = input_arg
        input_type = "sector"
        print(f"Processing sector ID: {sector_id}")
    
    print("=" * 60)
    print(f"Summary Generator using Local LLM")
    print(f"Input: {input_arg} ({input_type})")
    print(f"Model: {model_name}")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    # Step 1: Extract/load data
    if input_type == "sector":
        print(f"\n[1/4] Extracting sector {sector_id} data...")
        step_start = time.time()
        sector_data = extract_sector(sector_id)
        if not sector_data:
            return
        print(f"  ✓ Completed in {time.time() - step_start:.2f} seconds")
    else:
        print(f"\n[1/4] File already loaded")
    
    # Step 2: Collect summaries
    print("\n[2/4] Collecting all summaries...")
    step_start = time.time()
    summaries = collect_summaries(sector_data)
    if not summaries:
        print("No summaries found!")
        return
    print(f"  ✓ Completed in {time.time() - step_start:.2f} seconds")
    
    # Step 2.5: Deduplicate summaries
    summaries = deduplicate_summaries(summaries)
    
    # Step 3: Generate key events with AI (Stage 1)
    print("\n[3/5] Generating key events with AI (Stage 1)...")
    stage1_output = create_sector_summary_with_llm(summaries, sector_id, model_name=model_name)
    if not stage1_output:
        print("Failed to generate key events!")
        return
    
    print(f"  ✓ Stage 1 completed - extracted {len(stage1_output.get('key_events', []))} key events")
    
    # Debug: Show Stage 1 output
    if len(stage1_output.get('key_events', [])) == 0:
        print("\n⚠️  WARNING: Stage 1 returned 0 key events!")
        print("Stage 1 output:")
        print(json.dumps(stage1_output, indent=2, ensure_ascii=False))
        print("\nSkipping Stage 2 - no events to validate")
        return
    
    # Step 4: Consolidate and create final summary (Stage 2)
    print("\n[4/5] Consolidating key events and generating summary (Stage 2)...")
    sector_summary = consolidate_key_events(stage1_output['key_events'], sector_id, model_name=model_name)
    if not sector_summary:
        print("Failed to consolidate key events!")
        return
    
    print("\n" + "=" * 60)
    print(f"FINAL SUMMARY (JSON):")
    print("=" * 60)
    print(json.dumps(sector_summary, indent=2, ensure_ascii=False))
    print("=" * 60)
    
    # Step 5: Save results
    print("\n[5/5] Saving results...")
    step_start = time.time()
    save_results(sector_id, sector_summary)
    print(f"  ✓ Completed in {time.time() - step_start:.2f} seconds")
    
    total_time = time.time() - overall_start
    print("\n" + "=" * 60)
    print(f"✓ Process completed successfully!")
    print(f"Total execution time: {total_time:.2f} seconds ({timedelta(seconds=int(total_time))})")
    print(f"Finished at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

if __name__ == "__main__":
    main()
