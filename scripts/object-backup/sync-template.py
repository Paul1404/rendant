"""Keep the CloudFormation inline Lambda identical to its tested Python source."""
import argparse
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    template = root / "infra/rendant-object-backup.yaml"
    source = (Path(__file__).parent / "index.py").read_text()
    before, remainder = template.read_text().split("          # BEGIN GENERATED FUNCTION\n", 1)
    _, after = remainder.split("          # END GENERATED FUNCTION\n", 1)
    rendered = (before + "          # BEGIN GENERATED FUNCTION\n" +
                "".join("          " + line + "\n" for line in source.splitlines()) +
                "          # END GENERATED FUNCTION\n" + after)
    if args.check:
        if rendered != template.read_text():
            raise SystemExit("Run python3 scripts/object-backup/sync-template.py")
    else:
        template.write_text(rendered)


if __name__ == "__main__":
    main()
