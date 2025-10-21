"use strict";

import gulp from "gulp";
import concat from "gulp-concat";
import gulpIf from "gulp-if";
import include from "gulp-include";
import plumber from "gulp-plumber";
import rename from "gulp-rename";
import sourcemaps from "gulp-sourcemaps";
import uglify from "gulp-uglify";
import yaml from "gulp-yaml";
import browserSync from "browser-sync";
import cp from "child_process";
import { deleteAsync } from "del";
import fs from "fs";
import jsonSass from "json-sass";
import source from "vinyl-source-stream";
import replace from "gulp-replace";
import tap from "gulp-tap";
import path from "path";
import { generate } from 'critical';
import crypto from "crypto";

/**
 * Notify
 *
 * Show a notification in the browser's corner.
 *
 * @param {*} message
 */
function notify(message) {
  browserSync.notify(message);
}

/**
 * Config Task
 *
 * Build the main YAML config file.
 */
function config() {
  return gulp
    .src("src/yml/_config.yml")
    .pipe(include())
    .on("error", console.error)
    .pipe(gulp.dest("./"));
}

/**
 * Jekyll Task
 *
 * Build the Jekyll Site.
 *
 * @param {*} done
 */
function jekyll(done) {
  notify("Building Jekyll...");
  let bundle = process.platform === "win32" ? "bundle.bat" : "bundle";
  return cp
    .spawn(bundle, ["exec", "jekyll build"], { stdio: "inherit" })
    .on("close", done);
}

/**
 * Server Task
 *
 * Launch server using BrowserSync.
 *
 * @param {*} done
 */
function server(done) {
  browserSync({
    server: {
      baseDir: "_site",
    },
  });
  done();
}

/**
 * Reload Task
 *
 * Reload page with BrowserSync.
 *
 * @param {*} done
 */
function reload(done) {
  notify("Reloading...");
  browserSync.reload();
  done();
}

/**
 * Theme Tasks
 *
 * These three tasks are responsible for:
 * 1. Converting src/yml/theme.yml to src/tmp/theme.json
 * 2. Converting src/tmp/theme.json to _sass/_theme.scss
 * 3. Deleting src/tmp
 *
 * With these tasks we can apply the theme colors to SVGs and CSS elements using
 * just the src/yml/theme.yml file.
 */

function yamlTheme() {
  return gulp
    .src("src/yml/theme.yml")
    .pipe(yaml({ schema: "DEFAULT_SAFE_SCHEMA" }))
    .pipe(gulp.dest("src/tmp/"));
}

function jsonTheme() {
  return fs
    .createReadStream("src/tmp/theme.json")
    .pipe(
      jsonSass({
        prefix: "$theme: ",
      }),
    )
    .pipe(source("src/tmp/theme.json"))
    .pipe(rename("_sass/_theme.scss"))
    .pipe(gulp.dest("./"));
}

async function cleanTheme() {
  return await deleteAsync(["src/tmp"]);
}

const theme = gulp.series(yamlTheme, jsonTheme, cleanTheme);

/**
 * Main JS Task
 *
 * All regular .js files are collected, minified and concatonated into one
 * single scripts.min.js file (and sourcemap)
 */
function mainJs() {
  notify("Building JS files...");
  return gulp
    .src("src/js/main/**/*.js")
    .pipe(sourcemaps.init())
    .pipe(uglify())
    .pipe(concat("scripts.min.js"))
    .pipe(plumber())
    .pipe(sourcemaps.write("."))
    .pipe(gulp.dest("_site/assets/js/"))
    .pipe(browserSync.reload({ stream: true }))
    .pipe(gulp.dest("assets/js"));
}

/**
 * Preview JS Task
 *
 * Copy preview JS files to the assets folder.
 */
function previewJs() {
  notify("Processing preview files...");
  return gulp
    .src("src/js/preview/**/*.js")
    .pipe(plumber())
    .pipe(sourcemaps.init())
    .pipe(
      gulpIf(
        (file) => !file.basename.endsWith(".min.js"),
        uglify()
      )
    )
    .pipe(sourcemaps.write("."))
    .pipe(gulp.dest("_site/assets/js/"))
    .pipe(browserSync.reload({ stream: true }))
    .pipe(gulp.dest("assets/js"));
}

/**
 * JavaScript Task
 *
 * Run all the JS related tasks.
 */
const js = gulp.parallel(mainJs, previewJs);

/**
 * Images Task
 *
 * All images are optimized and copied to assets folder.
 */
gulp.task("optimize", async () => {
  const imagemin = (await import("gulp-imagemin")).default;
  notify("Copying image files...");
  return gulp
    .src(["src/img/**/*.{jpg,png,gif,svg}"], {
      encoding: false,
    })
    .pipe(plumber())
    .pipe(
      imagemin({ optimizationLevel: 5, progressive: true, interlaced: true }),
    )
    .pipe(gulp.dest("assets/img/"));
});

/**
 * Watch Task
 *
 * Watch files to run proper tasks.
 */
function watch() {
  // Watch YAML files for changes & recompile
  gulp.watch(
    ["src/yml/*.yml", "!src/yml/theme.yml"],
    gulp.series(config, jekyll, reload),
  );

  // Watch theme file for changes, rebuild styles & recompile
  gulp.watch(["src/yml/theme.yml"], gulp.series(theme, config, jekyll, reload));

  // Watch SASS files for changes & rebuild styles
  gulp.watch(["_sass/**/*.scss"], gulp.series(jekyll, reload));

  // Watch JS files for changes & recompile
  gulp.watch("src/js/main/**/*.js", mainJs);

  // Watch preview JS files for changes, copy files & reload
  gulp.watch("src/js/preview/**/*.js", gulp.series(previewJs, reload));

  // Watch images for changes, optimize & recompile
  gulp.watch("src/img/**/*", gulp.series("optimize", config, jekyll, reload));

  // Watch html/md files, rebuild config, run Jekyll & reload BrowserSync
  gulp.watch(
    [
      "*.html",
      "_includes/*.html",
      "_layouts/*.html",
      "_posts/*",
      "_authors/*",
      "pages/*",
      "category/*",
    ],
    gulp.series(config, jekyll, reload),
  );

  // Watch JSON config sources
  gulp.watch(
    ["_config.yml", "_data/locales/*.yml"],
    gulp.series(buildLocales, reload),
  );
}

function slugify(filename) {
  // Regex pour enlever la date (format YYYY-MM-DD) au début du nom de fichier
  return filename.replace(/^\d{4}-\d{2}-\d{2}-/, ""); // Retire les tirets à la fin
}

function apiBuild() {
  return gulp
    .src("_posts/*")
    .pipe(replace(/layout\: post/, "layout: json"))
    .pipe(
      tap(function (file) {
        const filename = file.stem; // Obtient le nom de fichier sans extension
        const slug = slugify(filename).toLowerCase();
        file.path = file.base + "/" + slug + ".md"; // Renomme le fichier avec le slug sans la date
      }),
    )
    .pipe(gulp.dest("api/v1/"));
}

/**
 * IndexNow Key Task
 *
 * If JEKYLL_ENV=production, generate a text file containing the INDEXNOW key.
 * The file will be named <INDEXNOW_KEY>.txt and placed inside the _site folder.
 */
function generateIndexNowKey(done) {
  const isProduction = process.env.JEKYLL_ENV === "production";
  const key = process.env.INDEXNOW_KEY;

  if (!isProduction) {
    console.log("Skipping IndexNow key generation (JEKYLL_ENV != production)");
    return done();
  }

  if (!key) {
    console.error("INDEXNOW_KEY environment variable is missing.");
    return done(new Error("INDEXNOW_KEY environment variable is missing."));
  }

  const dir = "_site";
  const filePath = `${dir}/${key}.txt`;

  try {
    // Ensure the _site directory exists before writing
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(filePath, key, "utf8");
    console.log(`✅ IndexNow key file generated in _site/: ${filePath}`);
  } catch (err) {
    console.error(`❌ Failed to create IndexNow key file: ${err.message}`);
    return done(err);
  }

  done();
}

/**
 * Minify robots.txt
 *
 * Trims all lines, removes blank lines, removes spaces after colons,
 * collapses multiple spaces in paths.
 */
function minifyRobotsTxt(done) {
  const filePath = "_site/robots.txt";
  if (!fs.existsSync(filePath)) {
    console.warn("⚠️ robots.txt not found, skipping minification.");
    return done();
  }

  try {
    let content = fs.readFileSync(filePath, "utf8");

    // Normalize line endings
    content = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // Split lines, trim, remove blank lines
    const lines = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        // Remove spaces after colon in User-agent/Sitemap/Allow/Disallow
        line = line.replace(/^(\w[\w-]*):\s+/, "$1:");
        // Collapse multiple spaces inside the line
        line = line.replace(/\s{2,}/g, " ");
        return line;
      });

    // Join lines with single \n
    content = lines.join("\n");

    fs.writeFileSync(filePath, content, "utf8");
    console.log("✅ robots.txt minified successfully.");
  } catch (err) {
    console.error("❌ Failed to minify robots.txt:", err.message);
    return done(err);
  }

  done();
}

/**
 * Build Locales JS
 *
 * Converts all YAML files in _data/locales into a single JS module:
 * assets/js/locales.js
 */
async function buildLocales() {
  const through = (await import("through2")).default;

  return gulp
    .src("_data/locales/*.{yml,yaml}")
    .pipe(plumber())
    .pipe(yaml({ schema: "DEFAULT_SAFE_SCHEMA" }))
    .pipe(
      through.obj(
        function (file, enc, cb) {
          const lang = path.basename(file.path, path.extname(file.path));
          const json = JSON.parse(file.contents.toString());
          if (!this.locales) this.locales = {};
          this.locales[lang] = json;
          cb();
        },
        function (cb) {
          const js = `export const locales = ${JSON.stringify(this.locales, null, 2)};`;
          fs.mkdirSync("assets/js", { recursive: true });
          fs.writeFileSync("assets/js/locales.js", js);
          console.log("✅ locales.js generated!");
          cb();
        },
      ),
    );
}

const CACHE_FILE = "_includes/critical/cache.json";

// Multi-resolution breakpoints
const breakpoints = [
  { width: 375, height: 667 },   // phone
  { width: 420, height: 800 },   // phone-lg
  { width: 760, height: 1024 },  // iphone
  { width: 768, height: 1024 },  // tablet
  { width: 1024, height: 1366 }, // tablet-lg
  { width: 1200, height: 800 },  // laptop
  { width: 1440, height: 900 },  // desktop
  { width: 1920, height: 1080 }, // wide
  { width: 2560, height: 1440 }, // ultra
];

// Pages and folders to skip
const skipPages = ['feed.xml', 'robots.txt', '404.html', 'sitemap.xml'];
const skipFolders = ['admin', 'api'];

// Hash content of a file
function hashFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return crypto.createHash("md5").update(content).digest("hex");
}

// Recursively get all HTML pages in _site
function getHtmlPages(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (skipFolders.includes(path.basename(filePath))) continue;
      results = results.concat(getHtmlPages(filePath));
    } else if (file.endsWith(".html") && !skipPages.includes(file)) {
      results.push(filePath);
    }
  }
  return results;
}

// Load/save cache
function loadCache() {
  if (!fs.existsSync(CACHE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// Try to locate Jekyll source file
function findSourceFile(relativePath) {
  const folders = ["pages", "_posts", "_drafts"];
  for (const folder of folders) {
    const full = path.join(folder, relativePath);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

// Compute a cache key: CSS + source file or fallback to HTML content
function getCacheKey(pagePath, cssHash) {
  let keyContent = cssHash;

  // Try source file
  const relative = pagePath.replace(/^_site/, "").replace(/index\.html$/, ".md");
  const sourceFile = findSourceFile(relative);

  if (sourceFile) {
    keyContent += hashFile(sourceFile);
  } else {
    // Fallback: use HTML content hash
    keyContent += hashFile(pagePath);
  }

  return crypto.createHash("md5").update(keyContent).digest("hex");
}

// Main critical CSS generator
export async function generateCriticalCss(done) {
  try {
    const cache = loadCache();
    const pages = getHtmlPages("_site");
    const cssFile = "_site/assets/css/styles.css";
    const cssHash = hashFile(cssFile);
    const newCache = { ...cache };

    for (const pagePath of pages) {
      const relativePage = path.relative("_site", pagePath);
      const cacheKey = getCacheKey(pagePath, cssHash);

      if (cache[relativePage] === cacheKey) {
        console.log(`⏭️  Skipped (cached): ${relativePage}`);
        continue;
      }

      // Generate critical CSS
      const { css } = await generate({
        base: "_site/",
        src: relativePage,
        css: [cssFile],
        inline: false,
        extract: true,
        dimensions: breakpoints,
      });

      const includeDir = path.join("_includes/critical", path.dirname(relativePage));
      fs.mkdirSync(includeDir, { recursive: true });
      fs.writeFileSync(path.join(includeDir, "index.css"), css);

      // Inject include under <!-- CRITICAL_CSS -->
      let html = fs.readFileSync(pagePath, "utf8");
      const liquidPath = decodeURIComponent(
        path.join("critical", path.dirname(relativePage), "index.css").replace(/\\/g, "/")
      );
      const includeTag = `{% include ${liquidPath} %}`;

      if (html.includes("<!-- CRITICAL_CSS -->")) {
        html = html.replace("<!-- CRITICAL_CSS -->", `<!-- CRITICAL_CSS -->\n${includeTag}`);
        fs.writeFileSync(pagePath, html, "utf8");
        console.log(`✅ Injected critical CSS into ${relativePage}`);
      }

      newCache[relativePage] = cacheKey;
      console.log(`✅ Critical CSS generated for ${relativePage}`);
    }

    saveCache(newCache);
    done();
  } catch (err) {
    console.error(err);
    done(err);
  }
}

gulp.task('generateCriticalCss', generateCriticalCss);



/**
 * Default Task
 *
 * Running just `gulp` will:
 * - Compile the theme, SASS and JavaScript files
 * - Optimize and copy images to its folder
 * - Build the config file
 * - Compile the Jekyll site
 * - Launch BrowserSync & watch files
 */
const run = gulp.series(
  buildLocales,
  gulp.parallel(js, theme, "optimize"),
  apiBuild,
  config,
  jekyll,
  minifyRobotsTxt,
  generateCriticalCss,
  gulp.parallel(server, watch),
);

/**
 * Build Task
 *
 * Running just `gulp build` will:
 * - Compile the theme, SASS and JavaScript files
 * - Optimize and copy images to its folder
 * - Build the config file
 * - Compile the Jekyll site
 */
const build = gulp.series(
  buildLocales,
  gulp.parallel(js, theme, "optimize"),
  apiBuild,
  config,
  jekyll,
  minifyRobotsTxt,
  generateCriticalCss,
  generateIndexNowKey,
);

export { run as default, build };
