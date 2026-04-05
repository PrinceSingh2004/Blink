/**
 * utils/columnMapper.js — Dynamic Schema Detection & Mapping
 * ═════════════════════════════════════════════════════════════
 * Author: Senior Backend Engineer
 * Detects real DB column names to prevent "Unknown column" errors.
 */

const { pool } = require('../config/db');

const columnCache = {};

/**
 * Gets the actual column name from a table given a list of possible names.
 * @param {string} table The database table name.
 * @param {string[]} options Array of possible column names (e.g. ['video_url', 'videoUrl', 'url']).
 * @returns {Promise<string|null>} The first matching column name or null.
 */
async function getColumn(table, options) {
    const cacheKey = `${table}:${options.join(',')}`;
    if (columnCache[cacheKey]) return columnCache[cacheKey];

    try {
        const [rows] = await pool.query(`DESCRIBE ??`, [table]);
        const columns = rows.map(r => r.Field.toLowerCase());

        for (const opt of options) {
            if (columns.includes(opt.toLowerCase())) {
                console.log(`🔍 [Schema] Found column "${opt}" in table "${table}"`);
                columnCache[cacheKey] = opt;
                return opt;
            }
        }

        console.warn(`⚠️ [Schema] No column from [${options.join(', ')}] found in table "${table}"`);
        return null;
    } catch (err) {
        console.error(`❌ [Schema Error] Failed to DESCRIBE table "${table}":`, err.message);
        return null;
    }
}

/**
 * Maps multiple columns for a table at once.
 */
async function mapColumns(table, mapping) {
    const result = {};
    for (const [key, options] of Object.entries(mapping)) {
        result[key] = await getColumn(table, options);
    }
    return result;
}

module.exports = { getColumn, mapColumns };
