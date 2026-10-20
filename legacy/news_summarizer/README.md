# KTMA - Financial News Summarization System

AI-powered financial news analysis using local LLM models with GPU acceleration. The system processes company news summaries across 23 sectors and generates ranked market intelligence reports.

## Overview

This system uses a **two-stage LLM pipeline** to:
1. Extract and rank key events from financial news by market impact
2. Deduplicate and validate events across sectors
3. Generate weekly market intelligence summaries

**Key Features:**
- 🚀 GPU-accelerated local inference (Ollama with CUDA)
- 📊 Processes 9,400+ tickers across 23 sectors
- 🎯 Two-stage analysis: extraction + deduplication
- 💰 Financial advisor perspective with impact scoring
- 🔄 Zero hallucination - only uses data from sources

## System Requirements

- **Python**: 3.13+
- **GPU**: NVIDIA GPU with 4GB+ VRAM or Apple Silicon
- **Ollama**: 0.12.7+
- **CUDA**: Compatible drivers
- **RAM**: 16GB+ recommended
- **Storage**: 10GB+ for models

## Installation

### 1. Install Ollama

```powershell
# Download Ollama from https://ollama.ai
# Install to default location
```

### 2. Pull Required Models

```powershell
$env:PATH = "$env:LOCALAPPDATA\Programs\Ollama;$env:PATH"
ollama pull granite4:tiny-h    # Primary model (fast, good instruction following)
ollama pull gemma3:4b          # Weekly summaries (better quality)
```

### 3. Install Python Dependencies

```powershell
pip install -r requirements.txt
```

## Project Structure

```
KTMA/
├── sectors_summary.json           # INPUT: Raw company news by sector
├── summarize_sector.py            # Stage 1+2: Extract & validate events per sector
├── batch_process_sectors.py       # Process all 23 sectors
├── weekly_summary.py              # Generate weekly market report
├── all_sectors_summary.json       # OUTPUT: All sector key events
├── weekly_summary.json            # OUTPUT: Final market intelligence
└── sector_X_summary.json          # Individual sector outputs
```

## Complete Workflow

### Step 1: Prepare Input Data

Ensure `sectors_summary.json` contains financial news structured as:

```json
{
  "1": {
    "ticker_count": 1152,
    "tickers": {
      "AAPL": {
        "summaries": ["Company announced...", "CEO stated..."]
      }
    }
  }
}
```

### Step 2: Process All Sectors (Batch)

```powershell
# Set environment and run batch processing
$env:PATH = "$env:LOCALAPPDATA\Programs\Ollama;$env:PATH"
python batch_process_sectors.py granite4:tiny-h 3

# Parameters:
# - granite4:tiny-h: Model name
# - 3: Batch size (process 3 sectors at a time)
```

**Expected output:**
- `all_sectors_summary.json` - 87 key events across 23 sectors
- Processing time: ~30-40 minutes (23 sectors, ~90 sec/sector)



### Step 3: Generate Weekly Summary

```powershell
# Generate market intelligence report
$env:PATH = "$env:LOCALAPPDATA\Programs\Ollama;$env:PATH"
python weekly_summary.py gemma3:4b

# Uses gemma3:4b for better quality output
```

**Expected output:**
- `weekly_summary.json` - Top 8-12 events with investment implications
- Processing time: ~2-3 minutes


## Processing Single Sector (Testing)

```powershell
# Test with one sector
$env:PATH = "$env:LOCALAPPDATA\Programs\Ollama;$env:PATH"
python summarize_sector.py 16 granite4:tiny-h

# Or specify input file
python summarize_sector.py sectors_summary.json granite4:tiny-h
```

## Two-Stage Pipeline Explained

### Stage 1: Event Extraction
- **Input**: Raw news summaries from all companies in sector
- **Process**: LLM acts as "senior financial advisor"
- **Output**: 5-8 ranked events with impact scores
- **Prompt focus**: 
  - Extract events with specific dollar amounts
  - Rank by market impact (billions > millions)
  - Assign impact_score: high/medium/low

### Stage 2: Deduplication & Validation
- **Input**: Stage 1 events
- **Process**: Quality control and duplicate removal
- **Output**: 3-6 validated unique events
- **Checks**:
  - Same company mentioned twice → remove duplicate
  - Same fact reported differently → merge
  - Generic events → filter out
  - Missing details → fill in defaults

**Fallback mechanism**: If Stage 2 fails, normalized Stage 1 output is used automatically.

## Environment Variables

```powershell
# Enable GPU acceleration
$env:OLLAMA_GPU_LAYERS = 'all'
$env:CUDA_VISIBLE_DEVICES = '0'

# Add Ollama to PATH
$env:PATH = "$env:LOCALAPPDATA\Programs\Ollama;$env:PATH"
```

## Model Selection Guide

| Model | Use Case | Speed | Quality | VRAM |
|-------|----------|-------|---------|------|
| **granite4:tiny-h** | Sector processing | Moderately fast | Better (Probably) | 2GB |
| **gemma3:4b** | Both - kinda | Medium | OK | 4GB |


**Recommendation**: 
- Batch processing: `granite4:tiny-h` (more accurate)
- Weekly summary: `gemma3:4b` (best quality)

## Command Reference

### Check Ollama Status
```powershell
$env:PATH = "$env:LOCALAPPDATA\Programs\Ollama;$env:PATH"
ollama list              # List installed models
ollama ps                # Check running models
```

### Process Specific Sectors
```powershell
# Process sectors 1, 10, 16 only
python batch_process_sectors.py granite4:tiny-h 3 1,10,16
```

### Debug Mode
```powershell
# See detailed output
python summarize_sector.py 16 granite4:tiny-h
```

