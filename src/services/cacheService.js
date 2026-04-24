'use strict';

const NodeCache = require('node-cache');

const CACHE_TTL = parseInt(process.env.CACHE_TTL) || 300; // 5 minutes default

// Create a single shared cache instance
const cache = new NodeCache({
  stdTTL: CACHE_TTL,
  checkperiod: 60, // Check for expired keys every 60 seconds
  useClones: false
});

/**
 * Get a value from cache
 * @param {string} key
 * @returns {any|undefined}
 */
const get = (key) => cache.get(key);

/**
 * Set a value in cache
 * @param {string} key
 * @param {any} value
 * @param {number} [ttl] - Optional custom TTL in seconds
 */
const set = (key, value, ttl) => {
  if (ttl !== undefined) {
    cache.set(key, value, ttl);
  } else {
    cache.set(key, value);
  }
};

/**
 * Delete a key from cache
 * @param {string} key
 */
const del = (key) => cache.del(key);

/**
 * Get cache stats
 */
const stats = () => cache.getStats();

/**
 * Flush all cache
 */
const flush = () => cache.flushAll();

module.exports = { get, set, del, stats, flush };
