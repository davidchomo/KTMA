"""
Batch process all sectors from sectors_summary.json
Processes sectors in batches and combines results into a single JSON file.

Usage:
  python batch_process_sectors.py                    # Process all sectors with default model
  python batch_process_sectors.py gemma3:4b          # Process with specific model
  python batch_process_sectors.py gemma3:1b 5        # Process with model and batch size
  python batch_process_sectors.py gemma3:1b 5 1,2,3  # Process specific sectors only

Output:
  all_sectors_summary.json - Combined results from all sectors
"""

import json
import os
import sys
import time
from datetime import datetime, timedelta
import subprocess

# Import functions from summarize_sector.py
from summarize_sector import (
    extract_sector,
    collect_summaries,
    deduplicate_summaries,
    create_sector_summary_with_llm,
    consolidate_key_events,
    check_gpu_support
)


def get_all_sector_ids(input_file='sectors_summary.json'):
    """Get all sector IDs from the JSON file."""
    print(f"Reading {input_file} to get all sector IDs...")
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    sector_ids = list(data.keys())
    print(f"Found {len(sector_ids)} sectors: {sector_ids}")
    return sector_ids


def process_single_sector(sector_id, model_name="gemma3:1b"):
    """Process a single sector and return the result."""
    print(f"\n{'='*60}")
    print(f"Processing Sector {sector_id}")
    print(f"{'='*60}")
    
    try:
        # Step 1: Extract sector data
        sector_data = extract_sector(sector_id)
        if not sector_data:
            print(f"  ⚠️ Sector {sector_id} not found, skipping...")
            return None
        
        # Step 2: Collect summaries
        summaries = collect_summaries(sector_data)
        if not summaries:
            print(f"  ⚠️ No summaries found for sector {sector_id}, skipping...")
            return None
        
        # Step 3: Deduplicate
        summaries = deduplicate_summaries(summaries)
        
        # Step 4: Stage 1 - Generate key events
        print(f"  Stage 1: Generating key events...")
        stage1_output = create_sector_summary_with_llm(summaries, sector_id, model_name=model_name)
        if not stage1_output:
            print(f"  ⚠️ Stage 1 failed for sector {sector_id}")
            return None
        
        key_events_count = len(stage1_output.get('key_events', []))
        print(f"  ✓ Stage 1 completed - {key_events_count} key events")
        
        if key_events_count == 0:
            print(f"  ⚠️ No key events extracted for sector {sector_id}")
            return {
                "sector_id": sector_id,
                "ticker_count": sector_data.get('ticker_count', 0),
                "summary_count": len(summaries),
                "generated_date": datetime.now().strftime('%Y-%m-%d'),
                "key_events": []
            }
        
        # Step 5: Stage 2 - Consolidate and deduplicate
        print(f"  Stage 2: Consolidating key events...")
        final_output = consolidate_key_events(stage1_output['key_events'], sector_id, model_name=model_name)
        if not final_output:
            print(f"  ⚠️ Stage 2 failed for sector {sector_id}, using Stage 1 output")
            final_output = stage1_output
        
        # Add metadata
        result = {
            "sector_id": sector_id,
            "ticker_count": sector_data.get('ticker_count', 0),
            "summary_count": len(summaries),
            "generated_date": final_output.get('generated_date', datetime.now().strftime('%Y-%m-%d')),
            "key_events": final_output.get('key_events', [])
        }
        
        print(f"  ✓ Sector {sector_id} completed - {len(result['key_events'])} final events")
        return result
        
    except Exception as e:
        print(f"  ❌ Error processing sector {sector_id}: {e}")
        return None


def process_batch(sector_ids, model_name="gemma3:1b", batch_size=5):
    """Process sectors in batches with progress tracking."""
    total_sectors = len(sector_ids)
    results = {}
    failed_sectors = []
    
    print(f"\n{'='*60}")
    print(f"BATCH PROCESSING {total_sectors} SECTORS")
    print(f"Model: {model_name}")
    print(f"Batch size: {batch_size}")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}")
    
    # Check GPU support once at the start
    check_gpu_support()
    
    overall_start = time.time()
    
    for i in range(0, total_sectors, batch_size):
        batch = sector_ids[i:i + batch_size]
        batch_num = (i // batch_size) + 1
        total_batches = (total_sectors + batch_size - 1) // batch_size
        
        print(f"\n{'#'*60}")
        print(f"BATCH {batch_num}/{total_batches}: Sectors {batch}")
        print(f"{'#'*60}")
        
        batch_start = time.time()
        
        for sector_id in batch:
            sector_start = time.time()
            result = process_single_sector(sector_id, model_name)
            
            if result:
                results[sector_id] = result
            else:
                failed_sectors.append(sector_id)
            
            sector_time = time.time() - sector_start
            print(f"  Sector {sector_id} took {sector_time:.1f}s")
        
        batch_time = time.time() - batch_start
        completed = len(results) + len(failed_sectors)
        remaining = total_sectors - completed
        
        print(f"\n📊 Batch {batch_num} completed in {batch_time:.1f}s")
        print(f"   Progress: {completed}/{total_sectors} ({100*completed/total_sectors:.1f}%)")
        print(f"   Successful: {len(results)}, Failed: {len(failed_sectors)}")
        
        if remaining > 0:
            avg_time_per_sector = (time.time() - overall_start) / completed
            eta = avg_time_per_sector * remaining
            print(f"   ETA: ~{timedelta(seconds=int(eta))}")
        
        # Save intermediate results after each batch
        save_intermediate_results(results, failed_sectors)
    
    total_time = time.time() - overall_start
    
    print(f"\n{'='*60}")
    print(f"BATCH PROCESSING COMPLETE")
    print(f"{'='*60}")
    print(f"Total time: {timedelta(seconds=int(total_time))}")
    print(f"Successful: {len(results)}/{total_sectors}")
    print(f"Failed: {len(failed_sectors)}")
    if failed_sectors:
        print(f"Failed sectors: {failed_sectors}")
    
    return results, failed_sectors


def save_intermediate_results(results, failed_sectors, output_file='all_sectors_summary_partial.json'):
    """Save intermediate results in case of interruption."""
    output = {
        "metadata": {
            "generated_date": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            "total_sectors": len(results),
            "failed_sectors": failed_sectors,
            "status": "in_progress"
        },
        "sectors": results
    }
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)


def save_final_results(results, failed_sectors, output_file='all_sectors_summary.json'):
    """Save final combined results to JSON file."""
    
    # Calculate statistics
    total_events = sum(len(s.get('key_events', [])) for s in results.values())
    total_summaries = sum(s.get('summary_count', 0) for s in results.values())
    total_tickers = sum(s.get('ticker_count', 0) for s in results.values())
    
    output = {
        "metadata": {
            "generated_date": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            "total_sectors": len(results),
            "total_tickers": total_tickers,
            "total_summaries_processed": total_summaries,
            "total_key_events": total_events,
            "failed_sectors": failed_sectors,
            "status": "complete"
        },
        "sectors": results
    }
    
    print(f"\nSaving final results to {output_file}...")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"✓ Saved to {output_file}")
    print(f"\n📊 FINAL STATISTICS:")
    print(f"   Sectors processed: {len(results)}")
    print(f"   Total tickers: {total_tickers}")
    print(f"   Total summaries: {total_summaries}")
    print(f"   Total key events: {total_events}")
    
    # Clean up partial file if exists
    partial_file = 'all_sectors_summary_partial.json'
    if os.path.exists(partial_file):
        os.remove(partial_file)
        print(f"   Cleaned up {partial_file}")
    
    return output_file


def main():
    """Main function to batch process all sectors."""
    
    # Parse command line arguments
    model_name = sys.argv[1] if len(sys.argv) > 1 else "gemma3:1b"
    batch_size = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    specific_sectors = sys.argv[3].split(',') if len(sys.argv) > 3 else None
    
    print(f"{'='*60}")
    print(f"SECTOR BATCH PROCESSOR")
    print(f"{'='*60}")
    print(f"Model: {model_name}")
    print(f"Batch size: {batch_size}")
    
    # Get sector IDs to process
    if specific_sectors:
        sector_ids = specific_sectors
        print(f"Processing specific sectors: {sector_ids}")
    else:
        sector_ids = get_all_sector_ids()
    
    # Sort sector IDs numerically if possible
    try:
        sector_ids = sorted(sector_ids, key=lambda x: int(x))
    except ValueError:
        sector_ids = sorted(sector_ids)
    
    print(f"Sectors to process: {len(sector_ids)}")
    print(f"Order: {sector_ids}")
    
    # Confirm before starting
    print(f"\n⚠️  This will process {len(sector_ids)} sectors.")
    print(f"   Estimated time: {len(sector_ids) * 2} - {len(sector_ids) * 5} minutes")
    print(f"   Press Ctrl+C to cancel, or wait 5 seconds to continue...")
    
    try:
        time.sleep(5)
    except KeyboardInterrupt:
        print("\n❌ Cancelled by user")
        return
    
    # Process sectors
    results, failed_sectors = process_batch(sector_ids, model_name, batch_size)
    
    # Save final results
    if results:
        save_final_results(results, failed_sectors)
    else:
        print("\n❌ No results to save!")


if __name__ == "__main__":
    main()
