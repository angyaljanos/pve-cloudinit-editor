import { load } from 'js-yaml';

export function validateYaml(source) {
    try {
        load(source);
        return { valid: true, message: 'Valid YAML.' };
    } catch (error) {
        const mark = error.mark;
        if (mark) {
            return {
                valid: false,
                message: `Invalid YAML at line ${mark.line + 1}, column ${mark.column + 1}: ${error.reason}`,
            };
        }
        return { valid: false, message: `Invalid YAML: ${error.message}` };
    }
}
