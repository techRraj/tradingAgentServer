const twilio = require('twilio');

let client = null;

// Lazy initialization - only create client when needed
const getClient = () => {
  if (client) return client;
  
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  
  // Check if credentials are valid
  if (!accountSid || !accountSid.startsWith('AC')) {
    console.log('⚠️  Twilio credentials not configured. Running in MOCK mode.');
    return null;
  }
  
  client = twilio(accountSid, authToken);
  return client;
};

class WhatsAppService {
  async sendAlert(toNumber, message) {
    const twilioClient = getClient();
    
    // Mock mode - just log to console
    if (!twilioClient) {
      console.log(`\n🔔 [MOCK WHATSAPP ALERT]`);
      console.log(`   To: ${toNumber}`);
      console.log(`   Message: ${message}`);
      console.log(`   --------------------------------\n`);
      return;
    }

    try {
      await twilioClient.messages.create({
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: toNumber,
        body: message
      });
      console.log(`✅ WhatsApp sent to ${toNumber}`);
    } catch (error) {
      console.error(`❌ WhatsApp Error: ${error.message}`);
    }
  }
}

module.exports = new WhatsAppService();