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
                content: "You are a trading assistant talking to a trader. Based on user's input, provide a pine script code which will be used for TradingView. Keep your responses very short. Just return with the code, nothing else."
            }]
        },
        createdAt: {
            type: Number, default: Date.now(),
        },
    }
)

module.exports = mongoose.model('ContextDataDB', contextDataSchema);
