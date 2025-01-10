const express = require('express');
const router = express.Router();
const addressController = require('../controllers/addressController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/', authMiddleware, addressController.addAddress);
router.get('/', authMiddleware, addressController.getAddresses);
router.get('/:addressId', authMiddleware, addressController.getAddressById);
router.put('/:addressId', authMiddleware, addressController.updateAddress);
router.delete('/:addressId', authMiddleware, addressController.deleteAddress);

module.exports = router;
