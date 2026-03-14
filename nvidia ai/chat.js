import axios from 'axios';

const invokeUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
const stream = true;

const headers = {
    "Authorization": "Bearer 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",
    "Accept": stream ? "text/event-stream" : "application/json"
};


const payload = {
    "model": "moonshotai/kimi-k2.5",
    "messages": [{ "role": "user", "content": "" }],
    "max_tokens": 16384,
    "temperature": 1.00,
    "top_p": 1.00,
    "stream": stream,
    "chat_template_kwargs": { "thinking": true },


};

Promise.resolve(
    axios.post(invokeUrl, payload, {
        headers: headers,
        responseType: stream ? 'stream' : 'json'
    })
)

    .then(response => {
        if (stream) {
            response.data.on('data', (chunk) => {
                console.log(chunk.toString());
            });
        } else {
            console.log(JSON.stringify(response.data));
        }
    })
    .catch(error => {
        console.error(error);
    });
