import assert from 'node:assert/strict';
import test from 'node:test';
import { validateYaml } from '../src/ui/validate.js';

test('accepts valid Cloud-Init YAML', () => {
    assert.deepEqual(validateYaml('#cloud-config\nusers:\n  - name: demo\n'), {
        valid: true,
        message: 'Valid YAML.',
    });
});

test('reports the location of invalid YAML', () => {
    const result = validateYaml('users:\n  - name: demo\n   shell: /bin/sh\n');
    assert.equal(result.valid, false);
    assert.match(result.message, /^Invalid YAML at line \d+, column \d+:/);
});

test('rejects duplicate mapping keys', () => {
    const result = validateYaml('packages:\n  - curl\npackages:\n  - git\n');
    assert.equal(result.valid, false);
    assert.match(result.message, /duplicate/i);
});
