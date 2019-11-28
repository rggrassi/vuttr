const User = require('../models/User');
const Token = require('../models/Token');
const crypto = require('crypto');
const isAfter = require('date-fns/isAfter');
const subDays = require('date-fns/subDays');
const Queue = require('../lib/Queue');

module.exports = {
  store: async (req, res) => {
    const { email, redirect } = req.value.body
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const newToken = await Token.create({
      token: crypto.randomBytes(32).toString('hex'),
      type: 'forgot',
      user: user._id,
      createdAt: new Date()
    })
    user.tokens.push(newToken);
    await user.save();
  
    const { token } = newToken;
    
    await Queue.add('Forgot', { user, redirect, token });

    return res.status(204).send();
  },

  update: async (req, res) => {  
    const { token } = req.params;
    const userToken = await Token.findOne({ token });    
    if (!userToken) {
      return res.status(400).json({ message: 'Token not valid' });
    }

    // Check if exists most recent tokens
    const latestTokens = await Token.find({ 
      user: userToken.user,
      type: 'forgot',
      createdAt: { $gt: userToken.createdAt }
    });
    if (latestTokens.length > 0) {
      return res.status(401).json({ 
        message: 'You have submitted another reset request, please use the most recent link'
      });
    }
   
    const expired = isAfter(
      subDays(new Date(), 2),
      userToken.createdAt
    );
    if (expired) {
      return res.status(401).json({ message: 'Recovery token is expired' });
    }
  
    const user = await User.findById(userToken.user);

    const { password } = req.value.body;
    user.password = password;          
    await user.save();

    await Queue.add('ForgotConfirmation', { user });
  
    return res.status(204).send();
  }
}