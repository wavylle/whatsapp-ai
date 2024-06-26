const mongoose = require('mongoose');

const contextDataSchema = mongoose.Schema(
    {
        wa_id: {
            type: String,
            required: true,
        },
        context_data: {
            type: Array,
            default: [{
                role: 'system',
                content: 'You are an helpful WhatsApp chatbot.'
            }]
        },
        createdAt: {
            type: Number, default: Date.now(),
        },
    }
)

module.exports = mongoose.model('ContextDataDB', contextDataSchema);