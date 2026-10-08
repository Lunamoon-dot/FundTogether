import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from anvil_state import inspect_state, promote_snapshot


def state(number=1):
    return {
        'block': {'number': hex(number)}, 'accounts': {},
        'best_block_number': number,
        'blocks': [{'header': {'number': '0x0'}}], 'transactions': [],
        'historical_states': [['0xabc', {'text': 'escaped " and unicode ảnh'}]],
    }


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.active = Path(self.temp.name) / 'state.json'
        self.pending = Path(self.temp.name) / 'state.pending.json'
        self.active.write_text(json.dumps(state()), encoding='utf-8')
        self.original = self.active.read_bytes()

    def test_truncated_dump_preserves_last_good_state(self):
        self.pending.write_text(json.dumps(state(2))[:-4])
        with self.assertRaises(ValueError):
            promote_snapshot(self.pending, self.active)
        self.assertEqual(self.active.read_bytes(), self.original)
        self.assertFalse(self.active.with_suffix('.json.previous').exists())

    def test_complete_dump_promotes_and_keeps_previous(self):
        self.pending.write_text(json.dumps(state(2)))
        promote_snapshot(self.pending, self.active)
        self.assertEqual(inspect_state(self.active)['best_block_number'], 2)
        self.assertEqual(self.active.with_suffix('.json.previous').read_bytes(), self.original)
        self.assertTrue(self.pending.exists())

    def test_rejects_empty_object_and_trailing_garbage(self):
        for content in ['{}', json.dumps(state()) + 'garbage']:
            self.pending.write_text(content)
            with self.assertRaises(ValueError):
                promote_snapshot(self.pending, self.active)
            self.assertEqual(self.active.read_bytes(), self.original)

    def test_rejects_older_snapshot(self):
        self.pending.write_text(json.dumps(state(0)))
        with self.assertRaises(ValueError):
            promote_snapshot(self.pending, self.active)
        self.assertEqual(self.active.read_bytes(), self.original)

    def test_rejects_mismatched_block_number(self):
        content = state(2)
        content['block']['number'] = '0x3'
        self.pending.write_text(json.dumps(content))
        with self.assertRaises(ValueError):
            promote_snapshot(self.pending, self.active)

    def test_replace_failure_preserves_active(self):
        self.pending.write_text(json.dumps(state(2)))
        with patch('anvil_state.os.replace', side_effect=OSError('interrupted')):
            with self.assertRaises(OSError):
                promote_snapshot(self.pending, self.active)
        self.assertEqual(self.active.read_bytes(), self.original)

    def test_chunk_boundaries_and_history_count(self):
        self.pending.write_text(json.dumps(state(2), ensure_ascii=False), encoding='utf-8')
        result = inspect_state(self.pending, chunk_size=7)
        self.assertEqual(result['historical_states'], 1)
        self.assertEqual(result['best_block_number'], 2)

    def test_source_changes_during_copy_are_rejected(self):
        self.pending.write_text(json.dumps(state(2)))
        copy = shutil.copyfile

        def changing_copy(source, destination):
            copy(source, destination)
            source.write_text(json.dumps(state(3)) + ' ')

        with patch('anvil_state.shutil.copyfile', side_effect=changing_copy):
            with self.assertRaises(ValueError):
                promote_snapshot(self.pending, self.active)
        self.assertEqual(self.active.read_bytes(), self.original)

    def test_malformed_block_is_rejected(self):
        for block in [None, {}, {'number': None}]:
            content = state()
            content['block'] = block
            self.pending.write_text(json.dumps(content))
            with self.assertRaises(ValueError):
                promote_snapshot(self.pending, self.active)


if __name__ == '__main__':
    unittest.main()
