@echo off
REM Enable NVIDIA CUDA support for Ollama

echo Configuring Ollama for NVIDIA CUDA GPU acceleration...
echo NVIDIA GPU: RTX 3050 (4GB VRAM)
echo.

REM Set environment variables for CUDA
set CUDA_VISIBLE_DEVICES=0
set OLLAMA_GPU_LAYERS=all

REM Stop any running Ollama process
echo Stopping Ollama service...
taskkill /F /IM ollama.exe 2>nul
timeout /t 2 /nobreak

REM Start Ollama with GPU support
echo Starting Ollama with CUDA GPU support...
ollama serve

pause
