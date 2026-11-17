import assert from 'node:assert/strict';
import test from 'node:test';
import { hasUserSnippet, withUserSnippet } from '../src/ui/cicustom.js';

test('replaces only user data and preserves other custom cloud-init files', () => {
    assert.equal(
        withUserSnippet(
            'network=local:snippets/net.yaml,user=old:snippets/user.yml,meta=local:snippets/meta.yaml',
            'shared:snippets/new.yaml',
        ),
        'network=local:snippets/net.yaml,meta=local:snippets/meta.yaml,user=shared:snippets/new.yaml',
    );
});

test('adds user data when no custom cloud-init file is configured', () => {
    assert.equal(withUserSnippet('', 'local:snippets/user.yaml'), 'user=local:snippets/user.yaml');
});

test('detects a custom user-data snippet among other custom files', () => {
    assert.equal(
        hasUserSnippet('network=local:snippets/net.yaml,user=local:snippets/u.yaml'),
        true,
    );
    assert.equal(hasUserSnippet('network=local:snippets/net.yaml'), false);
    assert.equal(hasUserSnippet(undefined), false);
});
