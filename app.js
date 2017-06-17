var process = require('process');
process.env.FFMPEG_PATH = './node_modules/ffmpeg/bin/ffmpeg.exe';

var request = require('request');
var http = require('http');
var ytdl = require('ytdl-core');
var fs = require('fs');
var q = require('q');
var path = require('path');
var ffmpeg = require('fluent-ffmpeg');
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var ffmetadata = require('ffmetadata');
var nodeID3 = require('node-id3');

// var lastFmApiBaseUrl = 'http://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=Artist_Name&limit=Limit&api_key=5cfe225d4173261c71b97704dc74031c&format=json';
var lastFmApiKey = 'api_key=5cfe225d4173261c71b97704dc74031c';
var lastFmApiBaseUrl = 'http://ws.audioscrobbler.com/2.0/?method=';
var lastFmRoutes = {
    getTopTracks: 'artist.gettoptracks&artist=Artist_Name&limit=Limit',
    getTrackInfo: 'track.getInfo&artist=Artist_Name&track=Track_Name'
};
var jsonFormat = 'format=json';

var youtubeApi = 'https://www.googleapis.com/youtube/v3/search?part=snippet&q=TrackName&type=video&maxResults=1&key=AIzaSyDOegfItpZ_goZccL_pmREwZoNXoaYZNaw';
var youtubeBaseUrl = 'https://www.youtube.com/watch?v=';

var songsPath = './Songs/';
var mp4DirectoryPath = songsPath + 'mp4/';
var mp3DirectoryPath = songsPath + 'mp3/';

var port = 3000;
var numOfParallelDownloads = 5;
var tracks = [];

app.use(bodyParser.json());

app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    res.setHeader('Access-Control-Allow-Credentials', true);

    next();
});

var urlencodedParser = bodyParser.urlencoded({ extended: false });

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
    console.log('tracksArray');

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
});

function lastFmApi(artist, limit, lyrics){
    // var lastFmApiInfo = lastFmApiBaseUrl.replace('Artist_Name', artist).replace('Limit', limit.toString());
    var method = lastFmRoutes.getTopTracks.replace('Artist_Name', artist).replace('Limit', limit.toString());
    var lastFmApiInfo = lastFmApiBaseUrl + method + '&' + lastFmApiKey + '&' + jsonFormat;
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
    var path = mp4DirectoryPath + artist + ' - ' + trackName + '.mp4';
    ytdl(youtubeBaseUrl + videoId)
        .pipe(fs.createWriteStream(path))
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
            var mp4FilePath = mp4DirectoryPath + artist + ' - ' + trackName + '.mp4';
            var mp3FilePath = mp3DirectoryPath + artist + '/' + artist + ' - ' + trackName + '.mp3';
            convert(mp4FilePath, mp3FilePath, function(mp4File, mp3File, error){
                if(!error){
                    fs.unlink(mp4File);
                    handleMetadata(artist, trackName, mp3File);
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
        .setFfmpegPath(process.env.FFMPEG_PATH)
        .output(output)
        .on('end', function(){
            console.log('conversion ended', output);
            callback(input, output);
        }).on('error', function(input, err){
        callback(err);
    }).run();
}


function handleMetadata(artist, trackName, path){
    obtainMetadata(artist, trackName, function(data){
        parseMetadata(data, function(error, album, date, title, genre, artist, image){
            if(error){
                return;
            }
            var imagePath = path.replace('.mp3', '.png');
            downloadImage(imagePath, image, function(){
                injectMetadata(path, album, date, title, genre, artist, imagePath);
            })
        })
    })
}

// injectMetadata('C:/Users/ofric/Desktop/Programming/SongDownloader/Songs/mp3/Metallica/Metallica - Enter Sandman.mp3', 'album', 'date', 'title', 'genre', 'artist', './Songs/mp3/Metallica/Metallica - Fuel.png')

function injectMetadata(path, album, date, title, genre, artist, image) {
    console.log('imagePath:', image);
    var tags = {
        title: title,
        artist: artist,
        album: album,
        date: date,
        genre: genre,
        image: image
    };

    nodeID3.write(tags, path);
    deleteImage(path.replace('.mp3', '.png'));
    // ffmetadata.read(path, function (err, data) {
    //     if (err) console.error("Error reading metadata", err);
    //     else console.log(data);
    // });
}

function obtainMetadata(artist, trackName, callback){
    var url = lastFmApiBaseUrl + lastFmRoutes.getTrackInfo + '&' + lastFmApiKey + '&' + jsonFormat;
    url = url.replace('Artist_Name', artist).replace('Track_Name', trackName);
    console.log(url);
    request(url, function(err, response, body){
        if(err){
            console.log(err);
        }
        else{
            callback(body);
        }
    });
}
var json = {
  test: "test"
};

parseMetadata('fas', function(err){
    console.log(err);
});

function parseMetadata(data, callback){
    try{
        var track = JSON.parse(data).track;
    }
    catch(ex)
    {
        callback(ex);
        return;
    }
    if(track === undefined){
        callback('error');
        return;
    }
    var album = track.album.title || ''; //if undefined -> ''
    var date = '';
    parseDate(track.wiki.published, function(parsedDate){
        date = parsedDate || '';
    });
    var title = track.name || '';
    var genre = track.toptags.tag[0].name || '';
    if(genre !== ''){
        genre = genre.charAt(0).toUpperCase() + genre.slice(1);
    }
    var artist = track.artist.name || '';
    var image = track.album.image[3]['#text'];

    callback(false, album, date, title, genre, artist, image);
}

function downloadImage(path, url, callback){
    var image = fs.createWriteStream(path);
    url = url.replace('https', 'http');
    http.get(url, function(response) {
        response.pipe(image)
            .on('finish', function () {
                console.log('finished downloading image');
                callback();
            })
    });
}

function deleteImage(path){
    console.log('path to delete', path);
    fs.unlink(path);
}

function parseDate(date, callback){
    var parsedDate = date.split(',')[0];
    parsedDate = parsedDate.substring(parsedDate[2] === ' ' ? 3 : 2, parsedDate.length);
    callback(parsedDate);
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
