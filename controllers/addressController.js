const Address = require('../models/Address');

// Add New Address
exports.addAddress = async (req, res) => {
  const { addressLine, city, postalCode, type, name, phoneNumber, latitude, longitude } = req.body;
  try {
    const newAddress = new Address({
      userId: req.user.userId,
      addressLine,
      city,
      postalCode,
      type,
      name,
      phoneNumber,
      latitude,
      longitude
    });
    await newAddress.save();
    res.status(201).json({ message: 'Address added successfully', addressId: newAddress._id });
  } catch (error) {
    res.status(500).json({ message: 'Adding address failed', error });
  }
};

// Get Saved Addresses
exports.getAddresses = async (req, res) => {
  try {
    const addresses = await Address.find({ userId: req.user.userId });
    res.status(200).json(addresses);
  } catch (error) {
    res.status(500).json({ message: 'Fetching addresses failed', error });
  }
};

// Get Address By Id
exports.getAddressById = async (req, res) => {
  try {
    const address = await Address.findById(req.params.addressId);
    res.status(200).json(address);
  } catch (error) {
    res.status(500).json({ message: 'Fetching address failed', error });
  }
};

// Update Address
exports.updateAddress = async (req, res) => {
  const { addressLine, city, postalCode, type, name, phoneNumber, latitude, longitude } = req.body;
  try {
    await Address.findByIdAndUpdate(req.params.addressId, {
      addressLine,
      city,
      postalCode,
      type,
      name,
      phoneNumber,
      latitude,
      longitude
    });
    res.status(200).json({ message: 'Address updated successfully' });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: 'Updating address failed', error });
  }
};

// Delete Address
exports.deleteAddress = async (req, res) => {
  try {
    await Address.findByIdAndDelete(req.params.addressId);
    res.status(200).json({ message: 'Address deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Deleting address failed', error });
  }
};
