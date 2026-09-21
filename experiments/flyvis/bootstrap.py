"""Experiment entry point for the official model used by the app."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'src/vision'))
from official_model import ROOT,torch,flyvis,load_model
