import argparse
import os
import sys
from pathlib import Path

# Ensure the ai_service root is on sys.path when executed directly
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

load_dotenv()

import uvicorn

from src.consumer import start_consumer


def run_api() -> None:
    ai_service_dir = str(Path(__file__).resolve().parent.parent)
    uvicorn.run(
        "src.api:app",
        app_dir=ai_service_dir,
        host=os.getenv("AI_SERVICE_HOST", "0.0.0.0"),
        port=int(os.getenv("AI_SERVICE_PORT", "8000")),
        reload=os.getenv("AI_SERVICE_RELOAD", "false").lower() in {"1", "true", "yes", "on"},
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="BrandPulse AI service")
    parser.add_argument(
        "--consumer",
        action="store_true",
        help="Run only the Redis stream consumer instead of the HTTP API",
    )
    args = parser.parse_args()

    if args.consumer:
        start_consumer()
    else:
        run_api()


if __name__ == "__main__":
    main()
