const { spawn, exec } = require("child_process");
const archiver = require("archiver");
const body = require("body-parser");
const app = require("express")();
const crypto = require("crypto");
const fs = require("fs");
const queue = [];

app.use(body.urlencoded({ extended: false }));
app.use(body.json());

const isInQueue = (uuid) => {
  for (let i = 0; i < queue.length; i++) {
    const element = queue[i];
    if (element.uuid === uuid) {
      return true;
    }
  }
  return false;
};

const isInQueueByName = (github_repo) => {
  for (let i = 0; i < queue.length; i++) {
    const element = queue[i];
    if (element.github_repo === github_repo) {
      return true;
    }
  }
  return false;
};

const GetByName = (github_repo) => {
  for (let i = 0; i < queue.length; i++) {
    const element = queue[i];
    if (element.github_repo === github_repo) {
      return element;
    }
  }
  return null;
};

app.get("*", function (req, res) {
  res.end(fs.readFileSync(`${__dirname}/index.html`));
});

app.post("/upload", (req, res) => {
  const uuid = crypto.randomUUID();
  const { github_repo, github_token, discord_webhook } = req.body;

  if (isInQueueByName(github_repo) === true) {
    return res.json({
      Message: "Your repo has been added to queue",
      Data: {
        uuid: GetByName(github_repo),
      },
    });
  }

  queue.push({ github_repo, github_token, discord_webhook, uuid });
  return res.json({
    Message: "Your repo has been added to queue",
    Data: {
      uuid: uuid,
    },
  });
});

app.get("/download", (req, res) => {
  const { uuid } = req.query;
  const path = `${__dirname}/builds/${uuid}.zip`;

  if (!uuid) {
    return res.json({
      Message: "bro what? where is the uuid?",
    });
  }

  if (fs.existsSync(path)) {
    res.sendFile(path);
  } else {
    if (isInQueue(uuid)) {
      res.json({ Message: "Your repo is still in queue" });
    } else {
      res.json({ Message: "Build does not exist" });
    }
  }
});

app.listen(3000);

setInterval(() => {
  for (let i = 0; i < queue.length; i++) {
    const element = queue[i];
    const { github_repo, github_token, discord_webhook } = element;

    console.log(`Building ${element.github_repo}`);
    console.log(element);

    const uuid = element.uuid;
    const errors = [];
    const outputs = [];

    if (!github_repo) {
      return res.json({
        Message: `please provide a valid github repo, like "author/repo"`,
      });
    }

    try {
      queue.splice(i);
      const name = github_repo.split("/")[1];
      const cloneGitCmd = `git clone https://${
        github_token != null ? `${github_token}@` : ""
      }github.com/${github_repo}.git ${name}`;

      console.log(`EXECUTING: ${cloneGitCmd}`);
      exec(cloneGitCmd, (err, out, serr) => {
        if (out) outputs.push(out.message);
        if (err) errors.push(err.message);
        if (serr) errors.push(serr.toString());

        const buildCommand = `cd ${name} && npm install`;
        console.log(`EXECUTING: ${buildCommand}`);

        exec(buildCommand, (err, out, serr) => {
          if (out) outputs.push(out.message);
          if (err) errors.push(err.message);
          if (serr) errors.push(serr.toString());

          const buildLoc = `./${name}/build`;
          console.log(`DELETING: ${buildLoc}`);

          fs.rmdir(buildLoc, { recursive: true, force: true }, function (err) {
            if (err) console.log(err);

            const buildCmd = `cd ${name} && npm run build`;
            exec(buildCmd, (err, out, serr) => {
              if (out) outputs.push(out.message);
              if (err) errors.push(err.message);
              if (serr) errors.push(serr.toString());

              const output = fs.createWriteStream(`./builds/${uuid}.zip`);
              const archive = archiver("zip");

              output.on("close", function () {
                console.log(archive.pointer() + " total bytes");
                console.log(
                  "archiver has been finalized and the output file descriptor has closed."
                );
              });

              archive.on("error", function (err) {
                throw err;
              });

              archive.pipe(output);
              archive.directory(`./${name}/build`, false);
              archive.finalize();

              setTimeout(() => {
                // too lazy to write
              }, 1000 * 60 * 60 * 1); // Delete After 1 Hour
            });
          });
        });
      });
    } catch (err) {
      return res.json({
        Message: "Something went wrong",
      });
    }
  }
}, 1000 * 5);
