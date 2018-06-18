const voicebase = require('../index');

global.expect = require('chai').expect;

global.api = new voicebase({
    bearerToken: process.env.VOICEBASE_TOKEN
});