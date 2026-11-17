package PVE::API2::Nodes::Nodeinfo::CloudInitEditor;

use strict;
use warnings;

use Encode qw(decode encode FB_CROAK);
use File::Basename qw(dirname);
use File::Path qw(make_path);
use File::Temp qw(tempfile);
use PVE::JSONSchema qw(get_standard_option);
use PVE::RESTHandler;
use PVE::RPCEnvironment;
use PVE::Storage;

use base qw(PVE::RESTHandler);

my $max_bytes = 1024 * 1024;

# Keep the filename pattern in sync with src/ui/editor.js.
my $common_parameters = {
    node => get_standard_option('pve-node'),
    vmid => get_standard_option('pve-vmid'),
    storage => get_standard_option('pve-storage-id'),
    filename => {
        type => 'string',
        pattern => '^[A-Za-z0-9][A-Za-z0-9_.-]{0,121}\.ya?ml$',
        maxLength => 128,
        description => 'A YAML filename in the storage snippets directory.',
    },
};

sub check_vm_permission {
    my ($vmid) = @_;
    my $rpcenv = PVE::RPCEnvironment::get();
    $rpcenv->check($rpcenv->get_user(), "/vms/$vmid", ['VM.Config.Cloudinit']);
}

sub snippet_path {
    my ($param) = @_;

    my $cfg = PVE::Storage::config();
    my $scfg = PVE::Storage::storage_check_enabled($cfg, $param->{storage}, $param->{node});
    die "storage '$param->{storage}' does not support snippets\n"
        if !$scfg->{content}->{snippets};

    # path() also returns owner and volume type in list context.
    my ($path) = PVE::Storage::path($cfg, "$param->{storage}:snippets/$param->{filename}");
    return $path;
}

sub read_snippet {
    my ($path) = @_;
    die "snippet is not a regular file\n" if !-f $path || -l $path;

    open my $fh, '<:raw', $path or die "cannot read snippet: $!\n";
    my $bytes = '';
    while (1) {
        my $chunk;
        my $read = read($fh, $chunk, 64 * 1024);
        die "cannot read snippet: $!\n" if !defined($read);
        last if !$read;
        $bytes .= $chunk;
        die "snippet exceeds the 1 MiB size limit\n" if length($bytes) > $max_bytes;
    }
    close $fh or die "cannot close snippet: $!\n";

    return decode('UTF-8', $bytes, FB_CROAK);
}

sub write_snippet {
    my ($path, $content) = @_;
    my $bytes = encode('UTF-8', $content, FB_CROAK);
    die "snippet exceeds the 1 MiB size limit\n" if length($bytes) > $max_bytes;

    my $directory = dirname($path);
    make_path($directory) if !-d $directory;
    my ($fh, $temporary) =
        tempfile('.pve-cloudinit-editor-XXXXXX', DIR => $directory, UNLINK => 0);

    eval {
        binmode $fh;
        print {$fh} $bytes or die "cannot write snippet: $!\n";
        close $fh or die "cannot close snippet: $!\n";
        chmod 0644, $temporary or die "cannot set snippet permissions: $!\n";
        rename $temporary, $path or die "cannot replace snippet: $!\n";
        1;
    } or do {
        my $error = $@ || "failed to save snippet\n";
        close $fh;
        unlink $temporary;
        die $error;
    };
}

__PACKAGE__->register_method({
    name => 'read_snippet',
    path => 'snippet',
    method => 'GET',
    proxyto => 'node',
    protected => 1,
    permissions => {
        check => ['perm', '/storage/{storage}', ['Datastore.Audit']],
    },
    parameters => {
        additionalProperties => 0,
        properties => $common_parameters,
    },
    returns => {
        type => 'object',
        properties => {
            content => { type => 'string' },
        },
    },
    code => sub {
        my ($param) = @_;
        check_vm_permission($param->{vmid});
        return { content => read_snippet(snippet_path($param)) };
    },
});

__PACKAGE__->register_method({
    name => 'write_snippet',
    path => 'snippet',
    method => 'POST',
    proxyto => 'node',
    protected => 1,
    permissions => {
        check => ['perm', '/storage/{storage}', ['Datastore.AllocateTemplate']],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            %$common_parameters,
            content => {
                type => 'string',
                maxLength => $max_bytes,
                description => 'UTF-8 YAML content, limited to 1 MiB.',
            },
        },
    },
    returns => { type => 'null' },
    code => sub {
        my ($param) = @_;
        check_vm_permission($param->{vmid});
        write_snippet(snippet_path($param), $param->{content});
        return undef;
    },
});

1;
