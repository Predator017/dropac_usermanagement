const express = require('express');
const bodyParser = require('body-parser');
const connectDB = require('./config/db');
const { connectRabbitMQ } = require("./rabbitmq");
const userRoutes = require('./routes/userRoutes');
const addressRoutes = require('./routes/addressRoutes');
const rideRoutes = require('./routes/rideRoutes');

const app = express();

// Connect to database
 connectDB();

 connectRabbitMQ();
// Middleware
app.use(bodyParser.json());

// Routes
app.use('/api/users', userRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/user-rides', rideRoutes)

module.exports = app;
