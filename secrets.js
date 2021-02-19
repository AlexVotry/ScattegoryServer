const url = process.env.NODE_ENV === 'production' ? 'https://alexvotry.info' : 'http://localhost:5000';

const secrets = {
  mongoUrl: "mongodb+srv://alexVotry:$category@cluster0.r7i2f.mongodb.net/scattegories?retryWrites=true&w=majority",
  reactUrl: url
}

module.exports = secrets;