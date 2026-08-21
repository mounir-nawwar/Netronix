import { afterEach, describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'

import connectDB from '../../config/mongodb.js'

describe('MongoDB connection URI construction', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it.each([
        'mongodb://127.0.0.1:27017/e-commerce?replicaSet=rs0&retryWrites=true',
        'mongodb+srv://user:password@cluster.example.net/e-commerce?retryWrites=true&w=majority',
    ])('passes the complete URI to mongoose without appending after its query: %s', async (uri) => {
        const connect = vi.spyOn(mongoose, 'connect').mockResolvedValue(mongoose)

        await connectDB({ mongoUri: uri })

        expect(connect).toHaveBeenCalledOnce()
        expect(connect).toHaveBeenCalledWith(uri)
    })
})
