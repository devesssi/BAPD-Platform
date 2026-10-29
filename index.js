import express from 'express';
import app from './server/index.js';

// Vercel detects this as the Express function entry; the app owns all API routing.
void express;
export default app;
