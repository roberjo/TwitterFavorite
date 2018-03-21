process.env.UV_THREADPOOL_SIZE = 128;
console.log('[STARTUP] process.env.UV_THREADPOOL_SIZE = '
    + process.env.UV_THREADPOOL_SIZE);

let Twit = require('twit');
let _ = require('underscore');
let moment = require('moment');
let config = require('./config.js');
require('log-timestamp');
let LanguageDetect = require('languagedetect');
let lngDetector = new LanguageDetect();


let T = new Twit(config.twitterKeys);

// Twitter symbols array
let searchSymbols = ['javascript',
    'angularjs',
    'node.js',
    '#php',
    'jquery',
    '#python',
    '#nodejs',
    'asp.net',
    'c#',
    'web api',
    'machine learning',
    'markov chain'];

// Queue Array for tweets to favorite
let tweetQueue = [];
let currentTweetStreams = 0;

console.log('[STARTUP] Starting TwitterFavorite');
let FiveMinutes = 5;
FiveMinInterval = FiveMinutes * 60 * 1000;
let TwoMinutes = 2;
TwoMinInterval = TwoMinutes * 60 * 1000;
let OneMinute = 1;
OneMinInterval = OneMinute * 60 * 1000;

//  filter the twitter public stream by keywords.
//
let stream = T.stream('statuses/filter', {track: searchSymbols});

currentTweetStreams++;
console.log('[STREAM] Tweet Stream Started... currentTweetStreams Count: '
    + currentTweetStreams);

stream.on('limit', function(limitMessage) {
    // Twitter API Limit Hit
    console.log('Twitter API Limit Hit: ' + limitMessage);
});

stream.on('end', function(response) {
    // Handle a disconnection
    console.log('Stream Ended');
});

stream.on('destroy', function(response) {
    // Handle a 'silent' disconnection from Twitter, no end/error event fired
    console.log('Stream Destroyed');
});

stream.on('message', function(msg) {
    // Handle a disconnection
    // console.log('[MESSAGE] Stream Message Received');
});

stream.on('delete', function(deleteMessage) {
    // ...
    console.log('Stream Delete Message: ' + deleteMessage);
});

stream.on('scrub_geo', function(scrubGeoMessage) {
    // ...
    console.log('Stream ScrubGeoMessage: ' + scrubGeoMessage);
});

stream.on('disconnect', function(disconnectMessage) {
    // ...
    console.log('[DISCONNECTED] Twitter Stream Disconnect Message. |Code: '
        + disconnectMessage.disconnect.code + '|StreamName: '
        + disconnectMessage.disconnect.stream_name + '|Reason: '
        + disconnectMessage.disconnect.reason);
});

stream.on('connect', function(request) {
    console.log('[CONNECTING] Twitter Stream connection attempted.');
});

stream.on('connected', function(response) {
    console.log('[CONNECTED] Twitter Stream connection successful. ('
        + response.statusCode + ')');
});

stream.on('reconnect', function(request, response, connectInterval) {
    // Handle a disconnection
    console.log('[RECONNECTED] Twitter Stream reconnecting in '
        + connectInterval + ' ('
        + response.statusCode + ')');
});

stream.on('warning', function(warning) {
    // ...
    console.log('[WARNING] Stream Warning. You are falling behind Twitter\'s'
        + 'firehose. '
        + warning);
});

stream.on('error', function(Error) {
    // ...
    console.log('[ERROR] Stream Error! Message: ' + Error.message
        + '|StatusCode: ' + Error.statusCode
        + '|Code: ' + Error.code
        + '|TwitterReply: ' + Error.twitterReply
        + '|allErrors: ' + Error.allErrors);
});

stream.on('unknown_user_event ', function(eventMsg) {
    console.log('[UNKNOWN] Unknown User Event Message: ' + eventMsg);
});

stream.on('tweet', function(tweet) {
    let tweetFavAlready = false;
    console.log('[TWEET] Found a tweet to process! id_str:'
        + tweet.id_str
        + ' created_at: '
        + tweet.created_at);

    // Make sure it was a valid tweet
    if (tweet.text !== undefined) {
        // We're gonna do some indexOf comparisons
        // and we want it to be case agnostic.
        let text = tweet.text.toLowerCase();

        // let MatchedKeyword = 0;

        // Go through every symbol and see if any of the keywords
        // were mentioned. If so, favorite the tweet
        _.each(searchSymbols, function(v) {
            if ((tweetFavAlready == false)
                && (text.indexOf(v.toLowerCase()) !== -1)) {
                MatchedKeyword = 1;

                let languageResults = lngDetector.detect(text);

                // console.log('LangResults: '
                // + tweet.id_str
                // + '|'
                // + languageResults);
                let englishTweet = 0;

                if ((typeof (languageResults) != undefined)
                    && (languageResults.length > 2)) {
                    for (let i = 0; i < 3; i++) {
                        if (languageResults[i][0]
                            === config.twitterConfig.language) {
                            englishTweet = 1;
                            break;
                        }
                    }
                }


                if ((tweet.retweeted_status !== 'undefined')
                    && (text.indexOf('rt ') !== 0)
                    && (tweet.favorited == false)
                    && (tweet.user.following == null)
                    && (tweet.user.followers_count > 50)
                    && (englishTweet == 1)
                    && (tweet.user.screen_name != 'dailyJsPackages')
                    && (tweet.user.screen_name != 'NutKacPI')
                ) {
                    // console.log('This tweet looks ready to favorite!');
                    console.log('[TWEET] Good Tweet found: '
                        + 'URL: https://twitter.com/' + tweet.user.screen_name
                        + '/status/' + tweet.id_str
                        + '|@' + tweet.user.screen_name
                        + '|Favorited: ' + tweet.favorited
                        + '|Following: ' + tweet.user.following
                        + '|TweetText: ' + text
                        + '|SymbolFound: ' + v);

                    tweetFavAlready = true;
                    saveTweet(tweet);
                }
            }
        });
    }
});
//
//  tweet 'Good Morning!'
//
// T.post('statuses/update',
// { status: "Let's go, Everyone! #ImOnline" }, function(err, data, response) {
//  console.log(data)
// })

/**
 *
 *
 * @param {any} timeInterval
 * @param {any} stream
 */
function startTweetCollector(timeInterval, stream) {
    if (currentTweetStreams == 0) {
        console.log('[STARTSTREAM] Starting tweetCollector.  '
            + 'currentTweetStreams Count: ' + currentTweetStreams);
        stream.start();
        currentTweetStreams++;
        console.log('[STARTSTREAM] Tweet Stream Started.  '
            + 'currentTweetStreams Count: ' + currentTweetStreams);
    }
    setTimeout(function() {
        killTweetCollector(FiveMinInterval, stream);
    }, timeInterval);
}
/**
 *
 *
 * @param {any} timeInterval
 * @param {any} stream
 */
function killTweetCollector(timeInterval, stream) {
    console.log('[KILLSTREAM] Killing Stream. '
        + 'currentTweetStreams Count: ' + currentTweetStreams);
    stream.stop();
    currentTweetStreams--;
    console.log('[KILLSTREAM] Stream Killed. '
        + 'currentTweetStreams Count: ' + currentTweetStreams);
    setTimeout(function() {
        startTweetCollector(OneMinInterval, stream);
    }, timeInterval);
}

setTimeout(function() {
    killTweetCollector(OneMinInterval, stream);
}, OneMinInterval);

/**
 *
 *
 * @param {any} timeInterval
 */
function tweetProcessor(timeInterval) {
    let tweetsFavd = 0;
    let len = tweetQueue.length;

    console.log('[PROCESSOR] Starting tweetProcessor|'
        + 'NumOfTweetsInStack:' + len);
    // Check the global queue to see if we have any tweets to favorite
    // If we have tweets old enough to fav, send them to the favoriting function
    for (let i = len - 1; i >= 0; i--) {
        let tweet = tweetQueue[i];
        if ((typeof (tweet) != undefined)) {
            if ((typeof (tweet.created_at) !== undefined)) {
                // Calculate how old this tweet is
                let MomentNow = moment();
                let tweetMoment = moment(tweet.created_at,
                    'dd MMM DD HH:mm:ss ZZ YYYY', 'en');
                let tweetMomentDiff = MomentNow.diff(tweetMoment, 'seconds');

                console.log('[TWEET] i = ' + i
                    + '|id_str: ' + tweet.id_str
                    + '|TweetAge: ' + tweetMomentDiff
                    + ' seconds.');

                // If tweet greater than 30 s old, fave it
                if (tweetMomentDiff > 30) {
                    tweetsFavd++;

                    // Pop this tweet out of the stack
                    let tweetObject = tweetQueue.splice(i, 1)[0];

                    // Favorite that tweet!
                    favoriteTweet(tweetObject.id_str);
                }
            }
        } else {
            console.log('[PROCESSOR] ERROR: '
                + 'Tweet object does not contain a created date.');
        }
    };
    console.log('[PROCESSOR] Ending tweetProcessor|Favd ' + tweetsFavd
        + ' of ' + len + ' tweets in the stack.');

    setTimeout(function() {
        tweetProcessor(TwoMinInterval);
    }, timeInterval);
}
// Start the Tweet Processing Loop Thread
setTimeout(function() {
    tweetProcessor(TwoMinInterval);
}, 30000);

/**
 * Saves a tweet on the stack
 * @function saveTweet
 * @param {any} tweet
 */
function saveTweet(tweet) {
    tweetQueue.push(tweet);
}

/**
 * Favorite a tweet via Twitter API call
 * @function favoriteTweet
 * @param {any} TweetIDStr
 */
function favoriteTweet(TweetIDStr) {
    T.post('favorites/create', {id: TweetIDStr}, function(err, data, response) {
        if (err) {
            console.log('[FAVTWEET ERROR] Couldnt favorite tweet! Err:' + err
                + '|ID: ' + data.id_str);
        } else {
            console.log('[FAVTWEET SUCCESS] Create.Favorite: '
                + 'Success|ID: ' + data.id_str
                + '|Favorited: ' + data.favorited + '|');
        }
    });
}

