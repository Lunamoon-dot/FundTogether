"""Summarize supplied reviewer CSV; never populate decisions or reference labels."""
import argparse
import csv
import hashlib
import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CORPUS = ROOT / '.local/workflow-b/reviewer-corpus-v3'
OUTCOMES = {'MET', 'NOT_MET', 'NEEDS_INFORMATION', 'INCONCLUSIVE'}
CRITERIA = {'C1', 'C2', 'C3', 'C4', 'OVERALL'}


def summarize(rows, references):
    labels = {item['id']: item['authoredLabel'] for item in references['items']}
    groups, seen, entered = {}, set(), 0
    for row in rows:
        # Sample/criterion IDs are prefilled in the blank template, not observations.
        if not any(row.get(k, '').strip() for k in ['reviewer_id', 'outcome', 'reason', 'sources', 'limits', 'started_at', 'finished_at', 'independent_reviewer']):
            continue
        entered += 1
        reviewer, sample, criterion = (row.get(k, '').strip() for k in ['reviewer_id', 'sample_id', 'criterion_id'])
        if not reviewer or sample not in labels or criterion not in CRITERIA:
            raise ValueError('Entered row requires reviewer ID and known sample/criterion IDs')
        key = (reviewer, sample, criterion)
        if key in seen:
            raise ValueError(f'Duplicate reviewer/sample/criterion: {key}')
        seen.add(key)
        group = groups.setdefault((reviewer, sample), {})
        group[criterion] = row
    completed, partial = [], 0
    for (reviewer, sample), group in groups.items():
        if set(group) != CRITERIA or any(not all(row.get(k, '').strip() for k in
                ['outcome', 'reason', 'sources', 'limits', 'started_at', 'finished_at', 'independent_reviewer']) for row in group.values()):
            partial += 1
            continue
        for row in group.values():
            if row['outcome'] not in OUTCOMES or row['independent_reviewer'].lower() not in {'true', 'false'}:
                raise ValueError('Outcome or independent_reviewer value is invalid')
            start, finish = (datetime.fromisoformat(row[k].replace('Z', '+00:00')) for k in ['started_at', 'finished_at'])
            if start.tzinfo is None or finish.tzinfo is None or finish < start:
                raise ValueError('Times must include timezone and finish must not precede start')
        overall = group['OVERALL']
        start, finish = (datetime.fromisoformat(overall[k].replace('Z', '+00:00')) for k in ['started_at', 'finished_at'])
        completed.append({'reviewerId': reviewer, 'sampleId': sample, 'outcome': overall['outcome'],
                          'authoredReference': labels[sample], 'elapsedSeconds': (finish - start).total_seconds(),
                          'selfDeclaredIndependentReviewer': overall['independent_reviewer'].lower() == 'true'})
    counts = {'MET': 0, 'NOT_MET': 0}
    false_accept = false_reject = abstentions = excluded = 0
    for item in completed:
        expected, actual = item['authoredReference'], item['outcome']
        if expected not in counts:
            excluded += 1  # Inconclusive, missing-information and conditional-return labels are not binary truth.
            continue
        counts[expected] += 1
        false_accept += expected == 'NOT_MET' and actual == 'MET'
        false_reject += expected == 'MET' and actual == 'NOT_MET'
        abstentions += actual in {'NEEDS_INFORMATION', 'INCONCLUSIVE'}
    return {'status': 'OBSERVATIONS_RECORDED' if completed else 'AWAITING_HUMAN_DATA',
            'enteredRows': entered, 'completedObservations': len(completed), 'partialObservationsExcluded': partial,
            'referenceIndependentlyValidated': False,
            'referenceScope': 'Author-defined synthetic scenarios; no independently validated truth or real-field accuracy claim',
            'comparisonToAuthoredReferences': {'definiteMetDenominator': counts['MET'], 'definiteNotMetDenominator': counts['NOT_MET'],
                'falseAcceptanceCount': false_accept, 'falseRejectionCount': false_reject,
                'falseAcceptanceRate': false_accept / counts['NOT_MET'] if counts['NOT_MET'] else None,
                'falseRejectionRate': false_reject / counts['MET'] if counts['MET'] else None,
                'abstentionsOnDefiniteReferences': abstentions, 'nonbinaryReferencesExcluded': excluded},
            'observations': completed}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--decisions', type=Path, default=CORPUS / 'reviewer-decisions.csv')
    args = parser.parse_args()
    with args.decisions.open(encoding='utf-8-sig', newline='') as handle:
        rows = list(csv.DictReader(handle))
    reference_path = CORPUS / 'evaluator-reference.json'
    result = summarize(rows, json.loads(reference_path.read_text(encoding='utf-8')))
    result['inputSha256'] = hashlib.sha256(args.decisions.read_bytes()).hexdigest()
    result['referenceSha256'] = hashlib.sha256(reference_path.read_bytes()).hexdigest()
    destination = ROOT / '.local/workflow-b/reviewer-results.json'
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"Reviewer input: {result['completedObservations']} complete, {result['partialObservationsExcluded']} partial; {result['status']}")


if __name__ == '__main__':
    main()
