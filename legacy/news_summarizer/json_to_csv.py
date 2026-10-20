import json
import csv

def main():
    print("Loading sectors_summary.json...")
    with open("sectors_summary.json", "r", encoding="utf-8") as f:
        sectors_data = json.load(f)
    
    print("Converting to CSV...")
    
    # Open CSV file with tab delimiter
    with open("sectors_summary.csv", "w", encoding="utf-8", newline='') as csvfile:
        writer = csv.writer(csvfile, delimiter='\t')
        
        # Write header
        writer.writerow([
            'sector_id',
            'ticker_symbol',
            'ticker_id',
            'ticker_title',
            'article_id',
            'article_title',
            'publication_date',
            'summary_long',
            'summary_bulletpoint'
        ])
        
        # Write data
        row_count = 0
        for sector_id, sector_data in sectors_data.items():
            for ticker_symbol, ticker_data in sector_data['tickers'].items():
                for summary in ticker_data['summaries']:
                    writer.writerow([
                        sector_id,
                        ticker_symbol,
                        ticker_data['ticker_id'],
                        ticker_data['title'],
                        summary['articles_id'],
                        summary['article_title'],
                        summary['publication_date'],
                        summary['summary_long'],
                        summary['summary_bulletpoint']
                    ])
                    row_count += 1
                    
                    if row_count % 1000 == 0:
                        print(f"  - Processed {row_count} rows...")
        
        print(f"\n✓ Successfully converted {row_count} rows to CSV")
    
    print("\nFile saved as: sectors_summary.csv")

if __name__ == "__main__":
    main()
