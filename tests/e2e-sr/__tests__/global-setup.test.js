/**
 * HTTP policy of the screen-reader login setup: plain HTTP only for hosts
 * that resolve to loopback, with the resolved address pinned into Chromium
 * so a DNS answer that changes between our lookup and the navigation
 * (rebinding) cannot send the password to another peer.
 */
const { assertSafeBaseUrl, resolveLoopbackAddresses, buildChromiumArgs } = require('../global-setup.js');

const lookupTable = (table) => async (host) => {
	if (!(host in table)) throw new Error('ENOTFOUND ' + host);
	return table[host].map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
};

describe('screen-reader login HTTP policy', () => {
	const savedAllow = process.env.WP_ALLOW_HTTP;
	afterEach(() => {
		if (savedAllow === undefined) delete process.env.WP_ALLOW_HTTP; else process.env.WP_ALLOW_HTTP = savedAllow;
	});

	test('literal loopback and localhost pass without a lookup and without pinning', async () => {
		const lookup = jest.fn();
		await expect(assertSafeBaseUrl('http://localhost:8080', lookup)).resolves.toEqual({ pinned: null });
		await expect(assertSafeBaseUrl('http://127.0.0.1:8080', lookup)).resolves.toEqual({ pinned: null });
		await expect(assertSafeBaseUrl('http://[::1]:8080', lookup)).resolves.toEqual({ pinned: null });
		expect(lookup).not.toHaveBeenCalled();
	});

	test('a hosts-file dev name that resolves to loopback passes and is pinned to that address', async () => {
		const lookup = lookupTable({ 'mnc4.local': ['127.0.0.1'], 'typography-stylist': ['127.0.0.1'] });
		await expect(assertSafeBaseUrl('http://mnc4.local', lookup)).resolves.toEqual({ pinned: '127.0.0.1' });
		await expect(assertSafeBaseUrl('http://typography-stylist:8080', lookup)).resolves.toEqual({ pinned: '127.0.0.1' });
		expect(buildChromiumArgs('mnc4.local', '127.0.0.1')).toEqual(['--host-resolver-rules=MAP mnc4.local 127.0.0.1']);
	});

	test('a LAN or public address is refused over plain HTTP', async () => {
		const lookup = lookupTable({ 'dev.lan': ['192.168.1.20'], 'staging.client.com': ['203.0.113.7'] });
		await expect(assertSafeBaseUrl('http://192.168.1.20', lookup)).rejects.toThrow(/does not resolve to loopback/);
		await expect(assertSafeBaseUrl('http://dev.lan', lookup)).rejects.toThrow(/does not resolve to loopback/);
		await expect(assertSafeBaseUrl('http://staging.client.com', lookup)).rejects.toThrow(/does not resolve to loopback/);
	});

	test('a name whose answers mix loopback with another address (rebinding round-robin) is refused', async () => {
		const lookup = lookupTable({ 'evil.example': ['127.0.0.1', '203.0.113.7'] });
		await expect(resolveLoopbackAddresses('evil.example', lookup)).resolves.toBeNull();
		await expect(assertSafeBaseUrl('http://evil.example', lookup)).rejects.toThrow(/does not resolve to loopback/);
	});

	test('an unresolvable name is refused', async () => {
		await expect(assertSafeBaseUrl('http://nonexistent-host.invalid', lookupTable({}))).rejects.toThrow(/does not resolve to loopback/);
	});

	test('HTTPS always passes; WP_ALLOW_HTTP=1 overrides for a trusted intranet host', async () => {
		const lookup = jest.fn();
		await expect(assertSafeBaseUrl('https://staging.client.com', lookup)).resolves.toEqual({ pinned: null });
		process.env.WP_ALLOW_HTTP = '1';
		await expect(assertSafeBaseUrl('http://192.168.1.20', lookup)).resolves.toEqual({ pinned: null });
		expect(lookup).not.toHaveBeenCalled();
	});

	test('a name mapped to both loopback families pins the IPv4 one; a v6-only name is bracketed for Chromium', async () => {
		const lookup = lookupTable({ 'mnc4.local': ['::1', '127.0.0.1'], 'six.local': ['::1'] });
		await expect(assertSafeBaseUrl('http://mnc4.local', lookup)).resolves.toEqual({ pinned: '127.0.0.1' });
		await expect(assertSafeBaseUrl('http://six.local', lookup)).resolves.toEqual({ pinned: '::1' });
		expect(buildChromiumArgs('six.local', '::1')).toEqual(['--host-resolver-rules=MAP six.local [::1]']);
	});

	test('no pin means no extra Chromium args', () => {
		expect(buildChromiumArgs('mnc4.local', null)).toEqual([]);
	});
});
