import { LRUCache } from 'mnemonist'

const defaultCacheCapacity = 50

export default new LRUCache<string, any>(defaultCacheCapacity)
