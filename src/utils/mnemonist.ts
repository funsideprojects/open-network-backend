import { LRUCache } from 'mnemonist'

export const connectionCache = new LRUCache<string, number>(10000)
