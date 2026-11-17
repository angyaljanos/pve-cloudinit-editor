use strict;
use warnings;

use File::Temp qw(tempdir);
use Test::More;

my $snippet_dir = tempdir(CLEANUP => 1);
my $storage_content = { snippets => 1 };

# Minimal stand-ins for the PVE libraries available on a Proxmox VE node.
BEGIN {
    $INC{$_} = __FILE__
        for qw(PVE/JSONSchema.pm PVE/RESTHandler.pm PVE/RPCEnvironment.pm PVE/Storage.pm);

    package PVE::JSONSchema;
    sub get_standard_option { return { type => 'string' } }

    sub import {
        no strict 'refs';
        *{ caller() . '::get_standard_option' } = \&get_standard_option;
    }

    package PVE::RESTHandler;
    sub register_method { }
}

sub PVE::Storage::config { return {} }
sub PVE::Storage::storage_check_enabled { return { content => $storage_content } }

sub PVE::Storage::path {
    my (undef, $volid) = @_;
    my ($name) = $volid =~ m!:snippets/(.+)$!;
    my $path = "$snippet_dir/$name";
    return wantarray ? ($path, undef, 'snippets') : $path;
}

use PVE::API2::Nodes::Nodeinfo::CloudInitEditor;

my $api = 'PVE::API2::Nodes::Nodeinfo::CloudInitEditor';
my $param = { node => 'pve', storage => 'local', filename => 'user.yaml' };
my $path = "$snippet_dir/user.yaml";

is_deeply(
    [$api->can('snippet_path')->($param)],
    [$path],
    'returns only the path in list context',
);

my $content = "#cloud-config\nhostname: caf\x{e9}\n";
$api->can('write_snippet')->($path, $content);
is($api->can('read_snippet')->($path), $content, 'round-trips UTF-8 content');

eval { $api->can('write_snippet')->($path, 'x' x (1024 * 1024 + 1)) };
like($@, qr/size limit/, 'rejects oversized content');
is($api->can('read_snippet')->($path), $content, 'keeps the previous file after a rejected write');

symlink($path, "$snippet_dir/link.yaml") or die "symlink failed: $!";
eval { $api->can('read_snippet')->("$snippet_dir/link.yaml") };
like($@, qr/not a regular file/, 'refuses to read symlinks');

$storage_content = {};
eval { $api->can('snippet_path')->($param) };
like($@, qr/does not support snippets/, 'rejects storages without snippets content');

done_testing();
