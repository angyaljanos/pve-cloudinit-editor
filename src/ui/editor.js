import { hasUserSnippet, withUserSnippet } from './cicustom.js';
import { validateYaml } from './validate.js';

// Keep in sync with the filename pattern in CloudInitEditor.pm.
const FILENAME_REGEX = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,121}\.ya?ml$/;

const apiRequest = (options) =>
    new Promise((resolve, reject) => {
        Proxmox.Utils.API2Request({
            ...options,
            success: (response) => resolve(response.result.data),
            failure: reject,
        });
    });

const confirm = (title, message) =>
    new Promise((resolve) => {
        Ext.Msg.confirm(title, message, (answer) => resolve(answer === 'yes'));
    });

Ext.define('PVE.qemu.CloudInitEditor', {
    extend: 'Ext.window.Window',

    title: gettext('Cloud-Init User-Data YAML'),
    width: 900,
    height: 650,
    modal: true,
    layout: 'fit',

    initComponent: function () {
        this.nodeUrl = `/nodes/${encodeURIComponent(this.nodename)}`;
        this.vmUrl = `${this.nodeUrl}/qemu/${this.vmid}`;

        this.items = [
            {
                xtype: 'form',
                bodyPadding: 12,
                layout: {
                    type: 'vbox',
                    align: 'stretch',
                },
                items: [
                    {
                        xtype: 'pveStorageSelector',
                        name: 'storage',
                        fieldLabel: gettext('Snippet storage'),
                        storageContent: 'snippets',
                        nodename: this.nodename,
                    },
                    {
                        xtype: 'textfield',
                        name: 'filename',
                        fieldLabel: gettext('Filename'),
                        emptyText: 'cloud-init-user.yaml',
                        allowBlank: false,
                        regex: FILENAME_REGEX,
                        regexText: gettext('Use a .yaml or .yml filename without a path.'),
                    },
                    {
                        xtype: 'textareafield',
                        name: 'content',
                        fieldLabel: gettext('User-Data'),
                        labelAlign: 'top',
                        flex: 1,
                        value: '#cloud-config\n',
                        inputAttrTpl: 'spellcheck="false"',
                        fieldStyle: 'font-family: monospace; font-size: 13px;',
                    },
                    {
                        xtype: 'component',
                        itemId: 'validation',
                        height: 24,
                        autoEl: { tag: 'div', role: 'status', 'aria-live': 'polite' },
                    },
                ],
            },
        ];

        this.buttons = [
            {
                text: gettext('Load'),
                handler: () => this.loadSnippet(),
            },
            '->',
            {
                text: gettext('Validate YAML'),
                handler: () => this.validateContent(),
            },
            {
                text: gettext('Save and attach'),
                handler: () => this.saveSnippet(),
            },
            {
                text: gettext('Cancel'),
                handler: () => this.close(),
            },
        ];

        this.callParent();
    },

    getField: function (name) {
        return this.down(`field[name=${name}]`);
    },

    getTarget: function () {
        const storage = this.getField('storage').getValue();
        const filenameField = this.getField('filename');
        if (!storage || !filenameField.getValue() || !filenameField.isValid()) {
            Ext.Msg.alert(
                gettext('Error'),
                gettext('Select a storage and enter a valid filename.'),
            );
            return null;
        }
        return { storage, filename: filenameField.getValue(), vmid: this.vmid };
    },

    validateContent: function () {
        const result = validateYaml(this.getField('content').getValue());
        const status = this.down('#validation');
        status.setHtml(Ext.String.htmlEncode(result.message));
        status.setStyle('color', result.valid ? '#187438' : '#a12622');
        return result.valid;
    },

    loadSnippet: async function () {
        const target = this.getTarget();
        if (!target) {
            return;
        }

        try {
            const snippet = await apiRequest({
                url: `${this.nodeUrl}/cloudinit-editor/snippet`,
                method: 'GET',
                params: target,
                waitMsgTarget: this,
            });
            this.getField('content').setValue(snippet.content);
            this.validateContent();
        } catch (response) {
            Ext.Msg.alert(gettext('Error'), response.htmlStatus);
        }
    },

    saveSnippet: async function () {
        const target = this.getTarget();
        if (!target || !this.validateContent()) {
            return;
        }

        const confirmed = await confirm(
            gettext('Save Cloud-Init snippet'),
            Ext.String.format(
                gettext(
                    "Save {0} and attach it as this VM's user-data? An existing file will be replaced.",
                ),
                Ext.String.htmlEncode(target.filename),
            ),
        );
        if (!confirmed) {
            return;
        }

        let errorTitle = gettext('Error');
        try {
            const config = await apiRequest({
                url: `${this.vmUrl}/config`,
                method: 'GET',
                waitMsgTarget: this,
            });
            await apiRequest({
                url: `${this.nodeUrl}/cloudinit-editor/snippet`,
                method: 'POST',
                params: { ...target, content: this.getField('content').getValue() },
                waitMsgTarget: this,
            });

            errorTitle = gettext('Snippet saved, but attaching it failed');
            await apiRequest({
                url: `${this.vmUrl}/config`,
                method: 'PUT',
                params: {
                    cicustom: withUserSnippet(
                        config.cicustom,
                        `${target.storage}:snippets/${target.filename}`,
                    ),
                },
                waitMsgTarget: this,
            });

            errorTitle = gettext('Snippet attached, but regenerating the Cloud-Init image failed');
            await apiRequest({
                url: `${this.vmUrl}/cloudinit`,
                method: 'PUT',
                waitMsgTarget: this,
            });
        } catch (response) {
            Ext.Msg.alert(errorTitle, response.htmlStatus);
            return;
        }

        this.cloudInitPanel.reload();
        this.close();
        Ext.Msg.alert(
            gettext('Saved'),
            gettext('Snippet saved, attached, and Cloud-Init image regenerated.'),
        );
    },
});

// Rows whose values only end up in the generated user-data, which a custom user= snippet replaces.
const USER_DATA_ROWS = ['ciuser', 'cipassword', 'sshkeys', 'ciupgrade'];

Ext.define('PVE.qemu.CloudInitEditorButton', {
    override: 'PVE.qemu.CloudInit',

    initComponent: function () {
        const caps = Ext.state.Manager.get('GuiCap');
        const canEdit = !!caps.vms['VM.Config.Cloudinit'];

        if (canEdit) {
            this.tbar = [
                ...(this.tbar || []),
                '-',
                {
                    xtype: 'button',
                    text: gettext('Edit User-Data YAML'),
                    handler: () =>
                        Ext.create('PVE.qemu.CloudInitEditor', {
                            nodename: this.pveSelNode.data.node,
                            vmid: this.pveSelNode.data.vmid,
                            cloudInitPanel: this,
                        }).show(),
                },
            ];
        }

        this.callParent();

        const extraRows = {
            cicustom: {
                header: gettext('Custom files'),
                iconCls: 'fa fa-file-code-o',
                defaultValue: '',
                renderer: (value) =>
                    value
                        ? value.split(',').map(Ext.htmlEncode).join('<br>')
                        : Proxmox.Utils.noneText,
                editor: canEdit
                    ? {
                          xtype: 'proxmoxWindowEdit',
                          subject: gettext('Custom files'),
                          width: 600,
                          items: {
                              xtype: 'proxmoxtextfield',
                              name: 'cicustom',
                              deleteEmpty: true,
                              emptyText: 'user=local:snippets/user.yaml,network=...',
                              fieldLabel: gettext('Custom files'),
                          },
                      }
                    : undefined,
            },
            citype: {
                header: gettext('Config drive type'),
                iconCls: 'fa fa-hdd-o',
                defaultValue: '',
                renderer: (value) => Ext.htmlEncode(value || Proxmox.Utils.defaultText),
                editor: canEdit
                    ? {
                          xtype: 'proxmoxWindowEdit',
                          subject: gettext('Config drive type'),
                          items: {
                              xtype: 'proxmoxKVComboBox',
                              name: 'citype',
                              deleteEmpty: true,
                              value: '__default__',
                              fieldLabel: gettext('Type'),
                              comboItems: [
                                  ['__default__', Proxmox.Utils.defaultText],
                                  ['nocloud', 'NoCloud'],
                                  ['configdrive2', 'ConfigDrive2'],
                                  ['opennebula', 'OpenNebula'],
                              ],
                          },
                      }
                    : undefined,
            },
        };
        // The data reader keeps its own copy of the rows; the first load happens on activation.
        Ext.apply(this.rows, extraRows);
        Ext.apply(this.rstore.getProxy().getReader().rows, extraRows);

        for (const key of USER_DATA_ROWS) {
            const rowdef = this.rows[key];
            const render = rowdef.renderer;
            rowdef.renderer = (value, ...args) => {
                const pending = args[5];
                const html = render ? render(value, ...args) : Ext.htmlEncode(value ?? '');
                if (!hasUserSnippet(this.getObjectValue('cicustom', '', pending))) {
                    return html;
                }
                const note = gettext('overridden by custom user-data');
                return `<span style="opacity: 0.5;">${html} (${note})</span>`;
            };
        }

        // Unchanged rows are not re-rendered on load, so refresh when cicustom changes.
        let lastCicustom;
        this.mon(this.rstore, 'load', () => {
            const cicustom = this.getObjectValue('cicustom', '', true);
            if (cicustom !== lastCicustom) {
                lastCicustom = cicustom;
                this.getView().refresh();
            }
        });
    },
});
