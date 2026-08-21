import mongoose from "mongoose";

import logger from "../lib/logger.js";

const connectDB = async ({ mongoUri = process.env.MONGODB_URI } = {}) => {

    // BE-011 — structured, and without the connection string. A driver's own
    // messages routinely contain it, credentials included (SEC-016).
    mongoose.connection.on('connected', () => {
        logger.info({ event: 'mongodb.connected' }, 'connected to MongoDB')
    })

    mongoose.connection.on('disconnected', () => {
        logger.warn({ event: 'mongodb.disconnected' }, 'disconnected from MongoDB')
    })

    mongoose.connection.on('error', (error) => {
        logger.error({ event: 'mongodb.error', name: error?.name }, 'MongoDB connection error')
    })

    // MONGODB_URI is a complete driver URI, including the database name. Never
    // append text to it: in a URI with query options that would put the database
    // name inside the query value (for example `...?retryWrites=true/e-commerce`).
    await mongoose.connect(mongoUri)

}

export default connectDB;