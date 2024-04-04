const fs = require("fs");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
const ffmpeg = require("fluent-ffmpeg");
const tmp = require("tmp-promise");

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

process.on("message", (message) => {
  const { tmpFile } = message;

  const endProcess = (payload) => {
    if (tmpFile) {
      fs.unlink(tmpFile, (err) => {
        if (err) {
          console.error(err);
        }
      });
    }

    process.send?.(payload);
    process.exit();
  };

  if (!tmpFile) {
    endProcess({
      status: 500,
      data: {
        error: "No temp file provided.",
      },
    });
    return;
  }

  const filename = tmpFile.split("/").pop();
  const tmpDir = tmp.dirSync();
  const writePath = `${tmpDir.name}/${filename}`;

  ffmpeg(tmpFile)
    .format("mp4")
    .addOptions(["-crf 28"])
    .on("end", () => {
      endProcess({
        status: 200,
        data: {
          transcodedPath: writePath,
        },
      });
    })
    .on("error", (err) => {
      console.log({ err });
      endProcess({
        status: 500,
        data: {
          error: err.message,
        },
      });
    })
    .save(writePath);
});
