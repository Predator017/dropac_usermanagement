const express = require('express');
const router = express.Router();
const rideController = require('../controllers/rideController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/request-ride',  rideController.createRideRequest);
router.get('/get-ridestatus',  rideController.getRideStatus);
router.post('/cancel-riderequest',  rideController.cancelRideRequest);
router.post('/rate-driver',rideController.rateDriver);
router.get('/user/:userId', rideController.getAllRides);


module.exports = router;
