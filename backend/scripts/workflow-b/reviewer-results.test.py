"""Synthetic parser tests are never human experiment observations."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('reviewer_results', Path(__file__).with_name('reviewer-results.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
REFERENCES = {'independentValidation': 'TODO', 'items': [{'id': 'R-1', 'authoredLabel': 'NOT_MET'},
              {'id': 'R-2', 'authoredLabel': 'INCONCLUSIVE'}]}


def complete(sample):
    return [{'reviewer_id': 'parser-fixture', 'sample_id': sample, 'criterion_id': criterion, 'outcome': 'MET',
             'reason': 'Parser input', 'sources': 'Synthetic parser data', 'limits': 'No human observation',
             'started_at': '2026-10-09T10:00:00+07:00', 'finished_at': '2026-10-09T10:05:00+07:00',
             'independent_reviewer': 'false'} for criterion in sorted(module.CRITERIA)]


class ReviewerResultsTest(unittest.TestCase):
    def test_blank_and_partial_are_not_completed_or_zero_error_rate(self):
        result = module.summarize([{'sample_id': 'R-1', 'criterion_id': 'C1'}], REFERENCES)
        self.assertEqual(result['completedObservations'], 0)
        self.assertIsNone(result['comparisonToAuthoredReferences']['falseAcceptanceRate'])
        result = module.summarize(complete('R-1')[:4], REFERENCES)
        self.assertEqual(result['partialObservationsExcluded'], 1)
        self.assertEqual(result['completedObservations'], 0)

    def test_denominators_exclude_nonbinary_labels_and_preserve_false_accept(self):
        result = module.summarize(complete('R-1') + complete('R-2'), REFERENCES)
        self.assertEqual(result['comparisonToAuthoredReferences']['falseAcceptanceCount'], 1)
        self.assertEqual(result['comparisonToAuthoredReferences']['definiteNotMetDenominator'], 1)
        self.assertEqual(result['comparisonToAuthoredReferences']['nonbinaryReferencesExcluded'], 1)
        self.assertFalse(result['referenceIndependentlyValidated'])
        self.assertEqual(result['observations'][0]['elapsedSeconds'], 300)

    def test_duplicate_and_invalid_time_reject(self):
        with self.assertRaises(ValueError):
            module.summarize(complete('R-1') * 2, REFERENCES)
        rows = complete('R-1')
        rows[0]['finished_at'] = '2026-10-09T09:00:00+07:00'
        with self.assertRaises(ValueError):
            module.summarize(rows, REFERENCES)


if __name__ == '__main__':
    unittest.main()
