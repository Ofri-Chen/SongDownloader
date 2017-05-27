var request = require('request');
var ytdl = require('ytdl-core');
var fs = require('fs');
var q = require('q');
var path = require('path');
var ffmpeg = require('fluent-ffmpeg');
var express = require('express');
var app = express();
var bodyParser = require('body-parser');

var lastFmApiBaseUrl = 'http://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=Artist_Name&limit=Limit&api_key=5cfe225d4173261c71b97704dc74031c&format=json';
var youtubeApi = 'https://www.googleapis.com/youtube/v3/search?part=snippet&q=TrackName&type=video&maxResults=1&key=AIzaSyDOegfItpZ_goZccL_pmREwZoNXoaYZNaw';
var youtubeBaseUrl = 'https://www.youtube.com/watch?v=';

var songsPath = './Songs/'
var mp4DirectoryPath = songsPath + 'mp4/';
var mp3DirectoryPath = songsPath + 'mp3/';

var port = 3000;
var numOfParallelDownloads = 5;
var tracks = [];

app.use(bodyParser.json());

app.use(function (req, res, next) {

    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:63342');

    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader('Access-Control-Allow-Credentials', true);

    // Pass to next layer of middleware
    next();
});

var urlencodedParser = bodyParser.urlencoded({ extended: false })

app.get('/v1/*', function(req, res){
    var request = req.url.split('/')[2];

    switch(request){
        case 'topTracks':
            var artist = req.url.split('/')[3].split('%20').join(' ');
            var limit = req.url.split('/')[4];
            var lyrics = true;
            if(req.url.length >= 5){
                if(req.url.split('/')[5] == 'noLyrics'){
                    lyrics = false;
                }
            }
            if(!validateLimit){
                limit = 50;
            }

            InitializeDirectories(artist);

            try{
                lastFmApi(artist, limit, lyrics);
                res.status(200).send();
            }
            catch(err){
                res.status(404).send();
            }
            break;

        case 'track':
            var artist = req.url.split('/')[3].split('%20').join(' ');
            var trackName = req.url.split('/')[4].split('%20').join(' ');
            InitializeDirectories(artist);
            var trackArray = [];
            trackArray.push(trackName);

            var lyrics = true;
            if(req.url.length >= 5){
                if(req.url.split('/')[5] == 'noLyrics'){
                    console.log('noLyrics');
                    lyrics = false;
                }
            }

            try{
                tracks.push({artist: artist, tracks: trackArray});
                run(lyrics);
                res.status(200).send();
            }
            catch(err){
                res.status(404).send();
            }

            break;

        case 'getTracksArray':
            res.status(200).send(tracks);
            break;
        default:
            res.status(404).send();
            break;
    }

});

app.post('/v1/*', urlencodedParser , function(req, res){
    var request = req.url.split('/')[2];

    switch(request){
        case 'tracksArray':
            var lyrics = true;
            if(req.url.length >= 3){
                if(req.url.split('/')[3] == 'noLyrics'){
                    console.log('noLyrics');
                    lyrics = false;
                }
            }

            InitializeDirectories(req.body.artist);
            tracks.push(req.body);
            run(lyrics);
            res.status(200).send();
            break;

        default:
            res.status(404).send();
    }
});

function validateLimit(limit){
    if(limit > 0 && limit <=50){
        return true;
    }
    return false;
}


app.listen(port, function(){
    console.log('listening on', port)
})

function lastFmApi(artist, limit, lyrics){
    var lastFmApiInfo = lastFmApiBaseUrl.replace('Artist_Name', artist).replace('Limit', limit.toString());
    request(lastFmApiInfo, function(error, response, body){
        if(!error){
            // var isRunning = !(tracks.length == 0);

            var trackNames = [];
            for(var i = 0; i < JSON.parse(body).toptracks.track.length; i++){
                trackNames.push(JSON.parse(body).toptracks.track[i].name);
            }
            tracks.push({artist: artist, tracks: trackNames});
            run(lyrics);
        }
    });
}

function run(lyrics){
    // for(var i = 0; i < numOfParallelDownloads; i++){
    while(numOfParallelDownloads > 0 && tracks.length > 0)
    {
        if(tracks[0].tracks.length > 0){
            numOfParallelDownloads--;
            youtubeApiRequest(tracks[0].artist, tracks[0].tracks.shift(), lyrics);
        }
        else{
            tracks.shift();
            // i--; // if i don't do that, the number of parallel downloads will decrease
        }
    }
        // if(tracks.length > 0){
        // }
    // }
}

function youtubeApiRequest(artist, trackName, lyrics){
    console.log('lyrics:', lyrics);
    name = artist + ' - ' + trackName;
    if((artist[0] >= 'a' && artist[0] <='z') ||
        artist[0] >= 'A' && artist[0] <='Z') {
        if(lyrics){
            name += ' lyrics';
        }
    }

    var youtubeApiInfo = youtubeApi.replace('TrackName', name);
    var videoId = 0;
    request(youtubeApiInfo, function(err, res, bod){
        videoId = JSON.parse(bod).items[0].id.videoId;
        downloadSong(artist, trackName, videoId);
    });
}


function downloadSong(artist, trackName, videoId){
    console.log(trackName);
    ytdl(youtubeBaseUrl + videoId)
        .pipe(fs.createWriteStream(mp4DirectoryPath + artist + ' - ' + trackName + '.mp4'))
        .on('finish', function () {
            numOfParallelDownloads++;
            console.log('finished:', trackName);
            if(tracks.length > 0){
                if(tracks[0].tracks.length > 0){
                    numOfParallelDownloads--;
                    youtubeApiRequest(tracks[0].artist, tracks[0].tracks.shift());
                }
                else{
                    tracks.shift();
                    if(tracks.length > 0){
                        numOfParallelDownloads--;
                        youtubeApiRequest(tracks[0].artist, tracks[0].tracks.shift()/*.name*/);
                    }
                }
            }
            convert(mp4DirectoryPath + artist + ' - ' + trackName + '.mp4', mp3DirectoryPath + artist + '/' + artist + ' - ' + trackName + '.mp3', function(file, error){
                if(!error){
                    fs.unlink(file);
                    // console.log(file);
                }
                else{
                    console.log('error:', error);
                }
            })
        })
}

function convert(input, output, callback){
    ffmpeg(input)
        .setFfmpegPath("./node_modules/ffmpeg/bin/ffmpeg.exe")
        .output(output)
        .on('end', function(){
            console.log('conversion ended', output);
            callback(input);
        }).on('error', function(input, err){
        callback(err);
    }).run();
}

function InitializeDirectories(artist){
    createDirectory(songsPath);
    createDirectory(mp4DirectoryPath);
    createDirectory(mp3DirectoryPath);
    createDirectory(mp3DirectoryPath + '/' + artist);
}

function createDirectory(path){
    if (!fs.existsSync(path)){
        fs.mkdirSync(path);
    }
}
