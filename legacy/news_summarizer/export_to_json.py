import pandas as pd
import json

def get_company_names(df: pd.DataFrame) -> dict:
    result = {}

    for tic in df['tics']:
        if "()" not in tic and tic not in result.keys():
            # more companies in one article
            if ',' in tic:
                companies = tic.split(',')
                for company in companies:
                    if company != "()":
                        result[company.strip()] = []
            else:
                result[tic.strip()] = []
    
    return result


def get_sectors_with_tickers(tickers_df: pd.DataFrame) -> dict:
    """Create a dictionary of sectors with their associated tickers"""
    sectors = {}
    ticker_to_sector = {}  # Mapping for quick lookup
    
    for _, row in tickers_df.iterrows():
        sector_id = row['sectors_id']
        ticker_symbol = row['symbol']
        
        # Skip if no ticker
        if pd.isna(ticker_symbol) or ticker_symbol == "":
            continue
        
        # Handle missing sector_id
        if pd.isna(sector_id) or sector_id == "":
            sector_id = "unassigned"
        else:
            sector_id = str(int(sector_id))
            
        # Initialize sector if not exists
        if sector_id not in sectors:
            sectors[sector_id] = {
                'tickers': {}
            }
        
        # Add ticker to sector
        if ticker_symbol not in sectors[sector_id]['tickers']:
            sectors[sector_id]['tickers'][ticker_symbol] = {
                'ticker_id': row['tickers_id'],
                'title': row['title'] if not pd.isna(row['title']) else '',
                'summaries': []
            }
            
        # Store mapping for quick lookup
        ticker_to_sector[ticker_symbol] = sector_id
    
    return sectors, ticker_to_sector


def main():
    # Load both CSV files
    summary_filename = "summary-export.csv"
    tickers_filename = "company-crypto-tickers-tabs.csv"
    
    print("Loading CSV files...")
    print(f"  - Loading {summary_filename}...")
    summary_df = pd.read_csv(summary_filename, sep=';')
    print(f"    ✓ Loaded {len(summary_df)} summary records")
    
    print(f"  - Loading {tickers_filename}...")
    tickers_df = pd.read_csv(tickers_filename, sep='\t')
    print(f"    ✓ Loaded {len(tickers_df)} ticker records")
    
    # Create sectors structure
    print("\nBuilding sectors structure...")
    sectors_data, ticker_to_sector = get_sectors_with_tickers(tickers_df)
    print(f"  ✓ Created {len(sectors_data)} sectors with {len(ticker_to_sector)} tickers")
    
    # Populate summaries for each ticker
    print("\nPopulating summaries for tickers...")
    summaries_added = 0
    for index, row in summary_df.iterrows():
        if index % 1000 == 0 and index > 0:
            print(f"  - Processing summary {index}/{len(summary_df)}...")
        
        tics = []
        
        if ', ' in row['tics']:
            companies = row['tics'].split(', ')
            tics.extend(companies)
        else:
            tics.append(row['tics'])
        
        for tic in tics:
            # Extract ticker symbol (remove company designation and whitespace)
            ticker_symbol = tic.replace(' (company)', '').strip()
            
            # Find which sector this ticker belongs to
            if ticker_symbol in ticker_to_sector:
                sector_id = ticker_to_sector[ticker_symbol]
                
                article_info = {
                    'articles_id': row['articles_id'],
                    'article_title': row['article_title'],
                    'publication_date': row['published_at'],
                    'summary_long': row['summary_long'],
                    'summary_bulletpoint': "Missing" if pd.isna(row['summary_bulletpoint']) else row['summary_bulletpoint']
                }
                
                sectors_data[sector_id]['tickers'][ticker_symbol]['summaries'].append(article_info)
                summaries_added += 1
    
    print(f"  ✓ Added {summaries_added} summaries to tickers")
    
    # Remove duplicate articles from unassigned if they exist in proper sectors
    print("\nRemoving duplicate articles from unassigned sector...")
    if "unassigned" in sectors_data:
        articles_in_proper_sectors = set()
        
        # Collect all article IDs from proper sectors
        for sector_id, sector_data in sectors_data.items():
            if sector_id != "unassigned":
                for ticker_data in sector_data['tickers'].values():
                    for summary in ticker_data['summaries']:
                        articles_in_proper_sectors.add(summary['articles_id'])
        
        # Remove those articles from unassigned tickers
        removed_count = 0
        for ticker_symbol, ticker_data in sectors_data["unassigned"]['tickers'].items():
            summaries_to_keep = []
            for summary in ticker_data['summaries']:
                if summary['articles_id'] not in articles_in_proper_sectors:
                    summaries_to_keep.append(summary)
                else:
                    removed_count += 1
            ticker_data['summaries'] = summaries_to_keep
        
        print(f"  ✓ Removed {removed_count} duplicate articles from unassigned sector")
    
    # Remove tickers with no summaries and empty sectors
    print("\nCleaning up empty tickers and sectors...")
    tickers_before = sum(len(sector['tickers']) for sector in sectors_data.values())
    
    # Remove tickers with empty summaries
    for sector_id in list(sectors_data.keys()):
        tickers_to_remove = []
        for ticker_symbol, ticker_data in sectors_data[sector_id]['tickers'].items():
            if len(ticker_data['summaries']) == 0:
                tickers_to_remove.append(ticker_symbol)
        
        for ticker_symbol in tickers_to_remove:
            del sectors_data[sector_id]['tickers'][ticker_symbol]
        
        # Remove sector if it has no tickers left
        if len(sectors_data[sector_id]['tickers']) == 0:
            del sectors_data[sector_id]
    
    tickers_after = sum(len(sector['tickers']) for sector in sectors_data.values())
    print(f"  ✓ Removed {tickers_before - tickers_after} tickers without summaries")
    print(f"  ✓ Kept {len(sectors_data)} sectors with summaries")
    
    # Add summary counts to each sector
    print("\nCalculating summary counts...")
    for sector_id in sectors_data:
        total_summaries = sum(len(ticker_data['summaries']) for ticker_data in sectors_data[sector_id]['tickers'].values())
        sectors_data[sector_id]['summary_count'] = total_summaries
        sectors_data[sector_id]['ticker_count'] = len(sectors_data[sector_id]['tickers'])
    print("  ✓ Summary counts calculated")
    
    # Write sectors structure to JSON
    print("\nWriting sectors_summary.json...")
    with open("sectors_summary.json", "w", encoding="utf-8") as f:
        json.dump(sectors_data, f, indent=4, ensure_ascii=False)
    print("  ✓ sectors_summary.json created")
    
    # Also keep the original flat structure
    print("\nBuilding flat ticker structure...")
    result = get_company_names(df=summary_df)
    print(f"  ✓ Found {len(result)} unique tickers")
    
    print("\nPopulating flat structure summaries...")
    for index, row in summary_df.iterrows():
        if index % 1000 == 0 and index > 0:
            print(f"  - Processing summary {index}/{len(summary_df)}...")
        
        tics = []

        if ', ' in row['tics']:
            companies = row['tics'].split(', ')
            tics.extend(companies)
        else:
            tics.append(row['tics'])

        for tic in tics:
            if tic in result.keys():
                article_info = {
                    'articles_id': row['articles_id'],
                    'article_title': row['article_title'],
                    'publication_date': row['published_at'],
                    'summary_long': row['summary_long'],
                    'summary_bulletpoint': "Missing" if pd.isna(row['summary_bulletpoint']) else row['summary_bulletpoint']
                }

                result[tic].append(article_info)

    print("\nWriting summary.json...")
    with open("summary.json", "w", encoding="utf-8") as f:
        json.dump(result, f, indent=4, ensure_ascii=False)
    print("  ✓ summary.json created")
    
    print("\n" + "="*50)
    print("EXPORT COMPLETE!")
    print("="*50)
    print(f"Generated sectors_summary.json with {len(sectors_data)} sectors")
    print(f"Generated summary.json with {len(result)} tickers")
    print("="*50)

if __name__ == "__main__":
    main()
