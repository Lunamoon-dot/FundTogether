import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name('anvil_state_reward.py')
SPEC = importlib.util.spec_from_file_location('anvil_state_reward', MODULE_PATH)
reward_state = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(reward_state)


def valid_state(block_number=4):
    return {
        'block': {'number': hex(block_number)},
        'accounts': {},
        'best_block_number': block_number,
        'blocks': [{}],
        'transactions': [],
    }


class RewardStateRecoveryTest(unittest.TestCase):
    def test_recovers_valid_pending_snapshot_when_active_state_is_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            active = root / 'linux' / 'state.json'
            pending = active.with_suffix('.json.pending')
            backup = root / 'windows' / 'state.json'
            manifest = root / 'deployment.local.json'
            pending.parent.mkdir(parents=True)
            pending.write_text(json.dumps(valid_state()), encoding='utf-8')
            manifest.write_text('{}', encoding='utf-8')

            reward_state.prepare_state(active, backup, manifest)

            self.assertEqual(reward_state.snapshots.inspect_state(active)['best_block_number'], 4)
            self.assertEqual(reward_state.snapshots.inspect_state(backup)['best_block_number'], 4)
            self.assertTrue(pending.exists())

    def test_rejects_invalid_pending_snapshot_without_replacing_it(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            active = root / 'linux' / 'state.json'
            pending = active.with_suffix('.json.pending')
            backup = root / 'windows' / 'state.json'
            manifest = root / 'deployment.local.json'
            pending.parent.mkdir(parents=True)
            pending.write_text('{"invalid":true}', encoding='utf-8')
            manifest.write_text('{}', encoding='utf-8')

            with self.assertRaisesRegex(ValueError, 'Missing Anvil snapshot fields'):
                reward_state.prepare_state(active, backup, manifest)

            self.assertFalse(active.exists())
            self.assertFalse(backup.exists())
            self.assertTrue(pending.exists())


if __name__ == '__main__':
    unittest.main()
