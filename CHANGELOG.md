# Changelog

## [0.6.0](https://github.com/parkejunior/jellycc-cli/compare/v0.5.1...v0.6.0) (2026-08-15)


### Features

* add audio track labels to silence scan ([7c81e93](https://github.com/parkejunior/jellycc-cli/commit/7c81e9302b9b5852231f54e54e9d30d9545b0808))
* add muted text for run conversion on merge menu ([2556649](https://github.com/parkejunior/jellycc-cli/commit/2556649af96bcd15c4ce8df085addd9ef9a871e8))
* add progress and track message on Silence Scan ([6b0fa93](https://github.com/parkejunior/jellycc-cli/commit/6b0fa93794cfb13e63b528fcc96ad7e1ee69fc24))
* **docker:** add multi-platform docker support and GHCR image ([#26](https://github.com/parkejunior/jellycc-cli/issues/26)) ([5aec72d](https://github.com/parkejunior/jellycc-cli/commit/5aec72d98055c75169c87e722e58a0dc4efcbe06))
* enhance spectrum sync messages ([e26b277](https://github.com/parkejunior/jellycc-cli/commit/e26b277a4aa372362c308681dafc78fa129c7bda))
* implement Silence Scan for audio drop detection ([4658675](https://github.com/parkejunior/jellycc-cli/commit/4658675a4c5671362602275677298e30ae0b0c71))
* implement silence scan for audio segments ([dc789d6](https://github.com/parkejunior/jellycc-cli/commit/dc789d60f160fa25a7847bfb0a2555fc1b6cb2b5))
* implement smart spectrum sync for audio merging ([c236acf](https://github.com/parkejunior/jellycc-cli/commit/c236acf6e583bc5959c993404cd121123713a949))
* implement smart spectrum sync for audio sync ([b269b1c](https://github.com/parkejunior/jellycc-cli/commit/b269b1c602bda58a572822268bcc784bbb7a723b))
* **merge:** add optimized repair as default and disk check ([14bf8db](https://github.com/parkejunior/jellycc-cli/commit/14bf8dbb270f53eeb6907c6a339bf620c442b3be))
* **merge:** add optimized repair as default and disk check ([bc78b24](https://github.com/parkejunior/jellycc-cli/commit/bc78b24f10ea2bfc8a5c9fdab8893c3a16a23d8a))


### Bug Fixes

* enhance sanitizePath to handle escaped spaces and Bash idioms ([1a19000](https://github.com/parkejunior/jellycc-cli/commit/1a190001fb8f803b90ffac5cbf5263a5582f9a59))
* handle escaped spaces and Bash idioms ([ff1592a](https://github.com/parkejunior/jellycc-cli/commit/ff1592a0c243d6951c79d35d2d2c5d96539564bf))
* reposition spectrum sync option in sync menu ([5143099](https://github.com/parkejunior/jellycc-cli/commit/51430993120113732de4a181eb2127cda26c2522))
* use address-based tracking for silence detection ([9a1452f](https://github.com/parkejunior/jellycc-cli/commit/9a1452f603aeffb19532f83c6b4e0ab48660982b))

## [0.5.1](https://github.com/parkejunior/jellycc-cli/compare/v0.5.0...v0.5.1) (2026-05-25)


### Bug Fixes

* add codec_name check for attached pictures ([a5d71f1](https://github.com/parkejunior/jellycc-cli/commit/a5d71f166a952861f73aeabbbdc3d5b1287b4962))
* resolve CodeQL vulnerabilities and code quality issues ([#13](https://github.com/parkejunior/jellycc-cli/issues/13)) ([fcd839d](https://github.com/parkejunior/jellycc-cli/commit/fcd839de7f6bc402e8c3986c92d70d2448643224))

## [0.5.0](https://github.com/parkejunior/jellycc-cli/compare/v0.4.0...v0.5.0) (2026-05-21)


### Features

* add auto align for track sync on merge command ([3820765](https://github.com/parkejunior/jellycc-cli/commit/38207656c2afbb3c5603069e5797777f0ec05648))
* add burn-in awareness for subtitles ([ad82b5e](https://github.com/parkejunior/jellycc-cli/commit/ad82b5ef2f8d98a774e32edfd23cba9007378d41))
* add dynamic quality for video and audio encode ([085e4cc](https://github.com/parkejunior/jellycc-cli/commit/085e4cc40c2cdf20ab247c3bf2e09cf2308d0bc0))
* add edit tags menu ([95c05f5](https://github.com/parkejunior/jellycc-cli/commit/95c05f5322a74a1232d807014abb11ff8db359c8))
* add file comparison on merge command ([3e2ef02](https://github.com/parkejunior/jellycc-cli/commit/3e2ef02a5b18d2b9e6b2595bc62b7092533c3419))
* add jellycc metadata on ffmpeg command ([f09e53a](https://github.com/parkejunior/jellycc-cli/commit/f09e53ac36f3e16d48486b9c98bef518a843e742))
* add jellycc on final filenames ([a3f22d3](https://github.com/parkejunior/jellycc-cli/commit/a3f22d30f8d947680f7257cc6c9fdbc1b5f6405b))
* add multiselect and burn-in subs and images warnings ([f547e40](https://github.com/parkejunior/jellycc-cli/commit/f547e4056764117df2b057d03fa87dca8a3a2a0a))
* add myopic scan to check command ([a10cf9b](https://github.com/parkejunior/jellycc-cli/commit/a10cf9b0d27c16fe051e7a5fc502701ddab3f453))
* add planned action for modifications on check command ([eb303b3](https://github.com/parkejunior/jellycc-cli/commit/eb303b3c046217f205482b19dd30928df8b5866d))
* add progress bar on conversion ([013d647](https://github.com/parkejunior/jellycc-cli/commit/013d647a9ccd795badf2591ed7545a64b4dc0cc4))
* add repair mode on menu ([fb29aff](https://github.com/parkejunior/jellycc-cli/commit/fb29aff9f4af5ff9bdc30493862f1590b2e79b1c))
* add subtitles delay warn on merge command ([6fc47a7](https://github.com/parkejunior/jellycc-cli/commit/6fc47a7e7ff7147e256d0b2d89cf0f3e936520a6))
* add synchronization and crop duration for merge command ([f50fd9f](https://github.com/parkejunior/jellycc-cli/commit/f50fd9f237f62256517909d81c94326077340f25))
* always enable repair mode on menu ([b00568a](https://github.com/parkejunior/jellycc-cli/commit/b00568a639486a917fe27ba4cc1c5d4adc51397f))
* create config command and use instead lang command ([06d1cb7](https://github.com/parkejunior/jellycc-cli/commit/06d1cb7048c0e5456f4c62860e987e0e450200cb))
* create lang command and add jellycc unicode logo ([f327bab](https://github.com/parkejunior/jellycc-cli/commit/f327bab9efb7bf895bb58099ccb5d16489100087))
* group track types on merge command ([b91c9d8](https://github.com/parkejunior/jellycc-cli/commit/b91c9d89129bd5dea8e91973645e9c7e3075c6b5))
* **lang:** use dynamic language for codec support matrix messages ([0f22cb3](https://github.com/parkejunior/jellycc-cli/commit/0f22cb33663e4fe86ad6acc2d905b355fd3caee3))
* **lang:** use dynamic language in remaining files ([5f482dc](https://github.com/parkejunior/jellycc-cli/commit/5f482dc92d50ad08c12b46e87bc1dcb62d2435a6))
* **lang:** use spider-man as placeholder ([31379bf](https://github.com/parkejunior/jellycc-cli/commit/31379bf568ea64056656cc87d43612d4fdd6347e))
* remove clipboard and add conversion + deep scan actions ([3085055](https://github.com/parkejunior/jellycc-cli/commit/3085055216e3c80592329dc16381154f2c4e8ba1))
* remove posters from final file ([dbf63ee](https://github.com/parkejunior/jellycc-cli/commit/dbf63eea62baadf744661d6f1e953327bbb3a7d8))
* **repair-mode:** add _repaired on filenames ([80283e4](https://github.com/parkejunior/jellycc-cli/commit/80283e485fe5f9b3f320c1b857a015b89aeb2688))
* **repair-mode:** implement invisible sync for native audio delay ([3d5d720](https://github.com/parkejunior/jellycc-cli/commit/3d5d7209b2dc99e79fc7b6d0c62992c634949651))
* **repair-mode:** use temp path to "washed" files ([7c1babd](https://github.com/parkejunior/jellycc-cli/commit/7c1babd06bfebe6ac600ed54b46163193ca6b771))
* **repair:** extract temp flow from builder.ts ([eed8297](https://github.com/parkejunior/jellycc-cli/commit/eed829719f15fa3855604de9d74936c8e79c4be1))
* set max muxing queue to high value ([5462665](https://github.com/parkejunior/jellycc-cli/commit/54626652f8f80947c58dca5dcafe88917e40d7e8))
* show installed version on welcome ([ec041d6](https://github.com/parkejunior/jellycc-cli/commit/ec041d62e05a5febf2196f884704fc290fa762cd))
* show just repair mode instead conversion mode ([aef03d0](https://github.com/parkejunior/jellycc-cli/commit/aef03d0278655dc6b15d28b28bca585fd47a8bc9))
* split index into check and merge commands ([d1369b5](https://github.com/parkejunior/jellycc-cli/commit/d1369b5b9057d4958d69917ac8b35eec45ae5f59))
* update script instructions and add deep scan and quick scan ([a469d06](https://github.com/parkejunior/jellycc-cli/commit/a469d06c257f4b3ef629302269ed229f535191fa))


### Bug Fixes

* add "washing machine" for all video and audio on repair mode ([a7fab04](https://github.com/parkejunior/jellycc-cli/commit/a7fab04e2389cac16ea98d758215e7f759991251))
* apply delay on subtitles in adjust sync mode ([82d0f53](https://github.com/parkejunior/jellycc-cli/commit/82d0f53659c36817fd3dfb0cfce435b4e0904b2a))
* **check:** show remux options when tags are modified ([2c081dd](https://github.com/parkejunior/jellycc-cli/commit/2c081ddb4b368269442e2526f04e7899bfeec24c))
* **check:** use log prompt for remux notice ([6471bd7](https://github.com/parkejunior/jellycc-cli/commit/6471bd786e9128bddd1389a643eeac251ecd72c9))
* ignore ffmpeg shortest arg for repair mode ([18e22b2](https://github.com/parkejunior/jellycc-cli/commit/18e22b27a05140dc6595f9bf4c9c5bf82468954e))
* ignore subtitles and data on deep scan ([7be61be](https://github.com/parkejunior/jellycc-cli/commit/7be61be521973a9d1ab1ce6bb6929bbf3605c6ab))
* **lang:** use translator in forgotten files ([e2bd156](https://github.com/parkejunior/jellycc-cli/commit/e2bd156706c410e04d252670266a736ce6b8e985))
* set bitrate for individual track ([58b9097](https://github.com/parkejunior/jellycc-cli/commit/58b9097852c3398ee7bba77ab05d0f731f14ba18))
* set max bitrate from original audio bitrate ([c9791ea](https://github.com/parkejunior/jellycc-cli/commit/c9791eac8f596186317609c1fb8a419d6c693dbd))
* use dynamic audio codec from fallback_rules ([26854fe](https://github.com/parkejunior/jellycc-cli/commit/26854fe5560f7532c5618bbfe8a760a0af468460))
* use dynamic video target rule instead static h264_8bit ([94329b0](https://github.com/parkejunior/jellycc-cli/commit/94329b099421337f966ff0a1a73aceff79227cbe))
* use process.exit to exit ([c9c4743](https://github.com/parkejunior/jellycc-cli/commit/c9c47435c9a2f6efc8bb0bb17f7debd63c310cac))
* use wav conversion on repair mode ([a6c436d](https://github.com/parkejunior/jellycc-cli/commit/a6c436d6b7ca507842715f67a5958a47b4dceb0a))


### Performance Improvements

* **repair-mode:** add -threads 0 to all ffmpeg tasks ([881d718](https://github.com/parkejunior/jellycc-cli/commit/881d718ed2c58b4287bf5d3f7f5643222e072567))

## [0.4.0](https://github.com/parkejunior/jellycc-cli/compare/v0.3.0...v0.4.0) (2026-05-12)


### Features

* create config command and use instead lang command ([06d1cb7](https://github.com/parkejunior/jellycc-cli/commit/06d1cb7048c0e5456f4c62860e987e0e450200cb))


### Bug Fixes

* use dynamic video target rule instead static h264_8bit ([94329b0](https://github.com/parkejunior/jellycc-cli/commit/94329b099421337f966ff0a1a73aceff79227cbe))

## [0.3.0](https://github.com/parkejunior/jellycc-cli/compare/v0.2.0...v0.3.0) (2026-05-08)


### Features

* add subtitles delay warn on merge command ([6fc47a7](https://github.com/parkejunior/jellycc-cli/commit/6fc47a7e7ff7147e256d0b2d89cf0f3e936520a6))
* **repair-mode:** add _repaired on filenames ([80283e4](https://github.com/parkejunior/jellycc-cli/commit/80283e485fe5f9b3f320c1b857a015b89aeb2688))
* **repair-mode:** implement invisible sync for native audio delay ([3d5d720](https://github.com/parkejunior/jellycc-cli/commit/3d5d7209b2dc99e79fc7b6d0c62992c634949651))
* **repair-mode:** use temp path to "washed" files ([7c1babd](https://github.com/parkejunior/jellycc-cli/commit/7c1babd06bfebe6ac600ed54b46163193ca6b771))


### Bug Fixes

* apply delay on subtitles in adjust sync mode ([82d0f53](https://github.com/parkejunior/jellycc-cli/commit/82d0f53659c36817fd3dfb0cfce435b4e0904b2a))
* **check:** show remux options when tags are modified ([2c081dd](https://github.com/parkejunior/jellycc-cli/commit/2c081ddb4b368269442e2526f04e7899bfeec24c))
* **check:** use log prompt for remux notice ([6471bd7](https://github.com/parkejunior/jellycc-cli/commit/6471bd786e9128bddd1389a643eeac251ecd72c9))


### Performance Improvements

* **repair-mode:** add -threads 0 to all ffmpeg tasks ([881d718](https://github.com/parkejunior/jellycc-cli/commit/881d718ed2c58b4287bf5d3f7f5643222e072567))

## [0.2.0](https://github.com/parkejunior/jellycc-cli/compare/v0.1.1...v0.2.0) (2026-05-05)


### Internationalization 🇬🇧🇧🇷
JellyCC now supports internationalization across the entire interface (some parts were still untranslated).


### Features

* **lang:** use dynamic language for codec support matrix messages ([0f22cb3](https://github.com/parkejunior/jellycc-cli/commit/0f22cb33663e4fe86ad6acc2d905b355fd3caee3))
* **lang:** use dynamic language in remaining files ([5f482dc](https://github.com/parkejunior/jellycc-cli/commit/5f482dc92d50ad08c12b46e87bc1dcb62d2435a6))
* **lang:** use spider-man as placeholder ([31379bf](https://github.com/parkejunior/jellycc-cli/commit/31379bf568ea64056656cc87d43612d4fdd6347e))


### Bug Fixes

* **lang:** use translator in forgotten files ([e2bd156](https://github.com/parkejunior/jellycc-cli/commit/e2bd156706c410e04d252670266a736ce6b8e985))
