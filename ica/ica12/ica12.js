const quoteButton = document.querySelector('#js-new-quote');
const answerButton = document.querySelector('#js-tweet');

const endpoint = 'https://trivia.cyberwisp.com/getrandomchristmasquestion';

let answerValue = "";

quoteButton.addEventListener('click', getQuote);
answerButton.addEventListener('click', displayAnswer);

async function getQuote() {
    try {
        const response = await fetch(endpoint);
        if (!response.ok) {
            throw Error(response.statusText);
        }

        const json = await response.json();
        
        answerValue = json['answer']; 
        
        document.querySelector('#js-answer-text').textContent = "";
        
        displayQuote(json['question']);

    } catch (err) {
        console.error(err);
        alert('Error: Failed to fetch new trivia.');
    }
}

function displayQuote(quote) {
    document.querySelector('#js-quote-text').textContent = quote;
}

function displayAnswer() {
    console.log("The answer is:", answerValue);
    
    if (answerValue) {
        document.querySelector('#js-answer-text').textContent = answerValue;
    } else {
        document.querySelector('#js-answer-text').textContent = "No answer loaded yet!";
    }
}

getQuote();