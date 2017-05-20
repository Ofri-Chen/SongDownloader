var request = require('request');
var ytdl = require('ytdl-core');
var fs = require('fs');
var q = require('q');
var path = require('path');
var ffmpeg = require('fluent-ffmpeg');
var express = require('express');
var app = express();

var lastFmApiBaseUrl = 'http://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=Artist_Name&limit=Limit&api_key=5cfe225d4173261c71b97704dc74031c&format=json';
var youtubeApi = 'https://www.googleapis.com/youtube/v3/search?part=snippet&q=TrackName&type=video&maxResults=1&key=AIzaSyDOegfItpZ_goZccL_pmREwZoNXoaYZNaw';
var youtubeBaseUrl = 'https://www.youtube.com/watch?v=';
var mp4DirectoryPath = '.\\..\\mp4\\';
var mp3DirectoryPath = '.\\..\\mp3\\';

var port = 3000;
var numOfParallelDownloads = 10;

createDirectory(mp4DirectoryPath);
createDirectory(mp3DirectoryPath);

app.get('/topTracks/*/[1-9][0-9]?', function(req, res){
    var artist = req.url.split('/')[2];
    var limit = req.url.split('/')[3];
    createDirectory(mp3DirectoryPath + '\\' + artist);

    try{
        lastFmApi(artist, limit);
        res.status(200).send('artist: ' + artist + ', limit: ' + limit);
    }
    catch(err){
        res.status(404).send();
    }
})

app.listen(port, function(){
    console.log('listening on', port)
})

function lastFmApi(artist, limit){
    var lastFmApiInfo = lastFmApiBaseUrl.replace('Artist_Name', artist).replace('Limit', limit.toString());
    request(lastFmApiInfo, function(error, response, body){
        if(!error){
            var tracks = JSON.parse(body).toptracks.track;
            // for(var i = 0; i < tracks.length; i++) {
            //     var trackName = tracks[i].name;
            //     youtubeApiRequest(artist, trackName);
            // }
            for(var i = 0; i < numOfParallelDownloads; i++){
                if(tracks.length > 0){
                    youtubeApiRequest(artist, tracks.pop().name, tracks);
                }
            }
        }
    });
}


function youtubeApiRequest(artist, trackName, tracks){
    name = artist + ' - ' + trackName + ' lyrics';
    var youtubeApiInfo = youtubeApi.replace('TrackName', name);
    var videoId = 0;
    request(youtubeApiInfo, function(err, res, bod){
        videoId = JSON.parse(bod).items[0].id.videoId;
        downloadSong(artist, trackName, videoId, tracks);
    });
}


function downloadSong(artist, trackName, videoId, tracks){

    console.log(trackName);
    ytdl(youtubeBaseUrl + videoId)
        .pipe(fs.createWriteStream(mp4DirectoryPath + artist + ' - ' + trackName + '.mp4'))
        .on('finish', function () {
            console.log('finished:', trackName);
            if(tracks.length > 0){
                youtubeApiRequest(artist, tracks.pop().name, tracks);
            }
            convert(mp4DirectoryPath + artist + ' - ' + trackName + '.mp4', mp3DirectoryPath + artist + '\\' + artist + ' - ' + trackName + '.mp3', function(file, error){
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
        // .setFfmpegPath("C:\\Users\\ofric\\Desktop\\SongDownloader\\VideoDownloader\\node_modules\\ffmpeg\\bin\\ffmpeg.exe")
        .output(output)
        .on('end', function(){
            console.log('conversion ended', output);
            callback(input);
        }).on('error', function(input, err){
        callback(err);
    }).run();
}

function createDirectory(path){
    if (!fs.existsSync(path)){
        fs.mkdirSync(path);
    }
}