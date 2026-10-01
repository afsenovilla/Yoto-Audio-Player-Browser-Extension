// Locate the script element containing the JSON data
const scriptElement = document.querySelector("script#__NEXT_DATA__");

if (scriptElement) {
  // Parse the JSON content of the script element
  const jsonData = JSON.parse(scriptElement.textContent);
  const card = jsonData.props.pageProps.card;

  // Access the chapters and tracks from the parsed JSON
  const chapters = card.content.chapters;

  // Collect all track titles, URLs, and formats into an array
  const tracks = [];
  chapters.forEach((chapter) => {
    chapter.tracks.forEach((track) => {
      tracks.push({
        title: track.title,
        url: track.trackUrl,
        format: track.format,
      });
    });
  });

  const MIME_TO_EXTENSION = {
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/mp4": "m4a",
  };

  const PLAY_ICON_URL = "https://share.yoto.co/img/player/play.png";
  const PAUSE_ICON_URL = "https://share.yoto.co/img/player/pause.png";

  // A minimal inline SVG so the per-track download button doesn't need a
  // network request of its own.
  const DOWNLOAD_ICON_DATA_URL =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>'
    );

  // ---------------------------------------------------------------------
  // Shared styles: the spinner, the "now playing" row highlight, and the
  // toast notifications used to report download success/failure. Injected
  // once so every element created below can just use the class names.
  // ---------------------------------------------------------------------
  function injectStyles() {
    if (document.getElementById("yap-styles")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "yap-styles";
    style.textContent = `
      .yap-spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid rgba(0, 0, 0, 0.15);
        border-top-color: #4a9d7a;
        border-radius: 50%;
        animation: yap-spin 0.8s linear infinite;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      }
      @keyframes yap-spin {
        to { transform: translate(-50%, -50%) rotate(360deg); }
      }
      .yap-track-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
      }
      .yap-play-button {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 28px;
        flex: none;
      }
      .yap-download-track {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background-color: #eef0ef;
        flex: none;
        transition: background-color 0.15s ease;
      }
      .yap-download-track:hover {
        background-color: #dfe3e1;
      }
      .yap-track-playing {
        background-color: rgba(117, 227, 176, 0.18) !important;
        border-radius: 6px;
        transition: background-color 0.2s ease;
      }
      .yap-toast-container {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 999999;
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: center;
        pointer-events: none;
      }
      .yap-toast {
        background: #333;
        color: #fff;
        padding: 10px 18px;
        border-radius: 8px;
        font-family: "Castledown", sans-serif;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 0.25s ease, transform 0.25s ease;
        max-width: 320px;
        text-align: center;
      }
      .yap-toast.yap-toast-visible {
        opacity: 1;
        transform: translateY(0);
      }
      .yap-toast.yap-toast-error {
        background: #c0392b;
      }
      .yap-download-track {
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }
  injectStyles();

  function getToastContainer() {
    let container = document.querySelector(".yap-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.className = "yap-toast-container";
      document.body.appendChild(container);
    }
    return container;
  }

  // Shows a small, auto-dismissing message at the bottom of the page. Used
  // to confirm a download finished (or explain that it failed) instead of
  // leaving the person guessing while errors only show up in the console.
  function showToast(message, type, duration) {
    const container = getToastContainer();
    const toast = document.createElement("div");
    toast.className = "yap-toast" + (type === "error" ? " yap-toast-error" : "");
    toast.setAttribute("role", "status");
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("yap-toast-visible"));

    setTimeout(() => {
      toast.classList.remove("yap-toast-visible");
      toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    }, duration || 4000);
  }

  // Makes a non-native clickable element (an <a> with no href, a styled
  // <img>, etc.) behave like a real button for keyboard and screen-reader
  // users: focusable, announced with a role and label (plus a native
  // tooltip via `title`), and activatable with Enter/Space in addition to
  // a click.
  function makeAccessibleButton(element, label) {
    element.setAttribute("role", "button");
    element.setAttribute("tabindex", "0");
    if (label) {
      setButtonLabel(element, label);
    }
    element.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        element.click();
      }
    });
  }

  // Keeps the accessible name (aria-label) and the native hover tooltip
  // (title) in sync, since both should always say the same thing.
  function setButtonLabel(element, label) {
    element.setAttribute("aria-label", label);
    element.setAttribute("title", label);
  }

  // Fetches a track and figures out the right file extension from its
  // Content-Type. Shared by the full-album ZIP and the single-track
  // download button so there is one place that knows how to do this.
  function fetchTrackBlob(track) {
    return fetch(track.url).then((response) => {
      const contentType = response.headers.get("Content-Type");
      const extension = MIME_TO_EXTENSION[contentType] || "m4a";
      return response.blob().then((blob) => ({ blob, extension }));
    });
  }

  function triggerBlobDownload(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }

  function sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*]/g, "").trim();
  }

  // Builds a ZIP with all audio tracks, the cover image and each chapter's
  // icon, then triggers a browser download. Shared by every "download all"
  // entry point so there is a single place that knows how to build the
  // archive. Resolves with the list of files that failed to fetch (if any)
  // so the caller can tell the person whether the ZIP is complete.
  function downloadCardZip() {
    const zip = new JSZip();
    const audioFolder = zip.folder("audio_files");
    const imageFolder = zip.folder("image_files");
    const failures = [];

    const trackPromises = tracks.map((track, index) => {
      return fetchTrackBlob(track)
        .then(({ blob, extension }) => {
          audioFolder.file(`${index + 1}. ${track.title}.${extension}`, blob);
        })
        .catch((error) => {
          console.error("Error downloading the file:", error);
          failures.push(track.title);
        });
    });

    // Fetch the cover image
    const contentCover = card.content.cover;
    const metadataCover = card.metadata.cover;
    const coverImageUrl = (contentCover && contentCover.imageL) || (metadataCover && metadataCover.imageL);

    let coverPromise = Promise.resolve();
    if (coverImageUrl) {
      coverPromise = fetch(coverImageUrl)
        .then((response) => response.blob())
        .then((blob) => {
          imageFolder.file("cover_image.png", blob);
        })
        .catch((error) => {
          console.error("Error downloading the cover image:", error);
          failures.push("cover image");
        });
    } else {
      console.warn("No cover image URL found in content or metadata.");
    }

    // Fetch images for each track
    let iconCounter = 1;
    const trackImagePromises = tracks.map((track, index) => {
      const chapter = chapters[index];
      const imageUrl = chapter?.display?.icon16x16;

      if (imageUrl) {
        const iconName = `Icon ${String(iconCounter).padStart(2, "0")}.png`;
        iconCounter++;
        return fetch(imageUrl)
          .then((response) => response.blob())
          .then((blob) => {
            imageFolder.file(iconName, blob); // Use the sequential icon name
          })
          .catch((error) => {
            console.error("Error downloading the track image:", error);
            failures.push(`icon for ${track.title}`);
          });
      } else {
        console.warn(`No image URL found for track: ${track.title}`);
        return Promise.resolve();
      }
    });

    return Promise.all([coverPromise, ...trackPromises, ...trackImagePromises]).then(() => {
      return zip.generateAsync({ type: "blob" }).then((content) => {
        // Get the title of the webpage and sanitize it for use as a filename
        const sanitizedTitle = sanitizeFilename(document.title);
        triggerBlobDownload(content, `${sanitizedTitle}.zip`);
        return { failures };
      });
    });
  }

  // Find all table cells (<td>) that contain track titles in the HTML
  const tableCells = document.querySelectorAll("td.MuiTableCell-root");

  // Tracks which track (if any) is currently playing, so starting a new one
  // pauses whichever was already playing instead of letting them overlap.
  let currentlyPlaying = null; // { audioElement, imgElement, playButton, cell, title }

  function showSpinner(entry) {
    entry.imgElement.style.display = "none";
    entry.spinnerElement.style.display = "inline-block";
    setButtonLabel(entry.playButton, `Loading ${entry.title}`);
  }

  function hideSpinner(entry) {
    entry.spinnerElement.style.display = "none";
    entry.imgElement.style.display = "";
  }

  function stopPlayback(entry) {
    entry.audioElement.pause();
    hideSpinner(entry);
    entry.imgElement.src = PLAY_ICON_URL;
    entry.cell.classList.remove("yap-track-playing");
    setButtonLabel(entry.playButton, `Play ${entry.title}`);
    if (currentlyPlaying === entry) {
      currentlyPlaying = null;
    }
  }

  // Iterate through each table cell to match the text with track titles
  tableCells.forEach((cell) => {
    const titleNode = Array.from(cell.childNodes).find(
      (node) =>
        node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== ""
    );

    const title = titleNode ? titleNode.textContent : null;

    if (title) {
      const matchingTrack = tracks.find((track) => track.title === title);

      if (matchingTrack) {
        const audioElement = document.createElement("audio");
        audioElement.src = matchingTrack.url;
        audioElement.preload = "none";

        const playButton = document.createElement("a");
        playButton.className = "yap-play-button";

        const imgElement = document.createElement("img");
        imgElement.src = PLAY_ICON_URL;
        imgElement.alt = "Play";
        imgElement.style.width = "26px";
        imgElement.style.height = "28px";
        imgElement.style.cursor = "pointer";

        // Shown instead of the play/pause icon while the browser is still
        // fetching enough of the track to start playing (preload is "none",
        // so the first click always has to wait a moment).
        const spinnerElement = document.createElement("span");
        spinnerElement.className = "yap-spinner";
        spinnerElement.style.display = "none";

        const entry = { audioElement, imgElement, spinnerElement, playButton, cell, title };

        makeAccessibleButton(playButton, `Play ${title}`);

        audioElement.addEventListener("waiting", () => showSpinner(entry));
        audioElement.addEventListener("playing", () => {
          hideSpinner(entry);
          imgElement.src = PAUSE_ICON_URL;
          setButtonLabel(playButton, `Pause ${title}`);
        });
        audioElement.addEventListener("error", () => {
          stopPlayback(entry);
          showToast(`Couldn't play "${title}"`, "error");
        });

        // Reset the icon/label once playback finishes naturally, without
        // re-registering this listener on every click.
        audioElement.addEventListener("ended", () => stopPlayback(entry));

        playButton.addEventListener("click", function (e) {
          e.preventDefault();

          if (currentlyPlaying === entry) {
            stopPlayback(entry);
            return;
          }

          // Only one track should ever be audible at a time.
          if (currentlyPlaying) {
            stopPlayback(currentlyPlaying);
          }

          if (audioElement.readyState < 3) {
            showSpinner(entry);
          }
          audioElement.play();
          cell.classList.add("yap-track-playing");
          currentlyPlaying = entry;
        });

        // A separate, smaller button to download just this one track
        // without pulling the whole album's ZIP. Styled as a small round
        // chip (rather than a bare arrow) so it reads as a button next to
        // Yoto's own circular play icon instead of clashing with it.
        const downloadTrackButton = document.createElement("a");
        downloadTrackButton.className = "yap-download-track";

        const downloadIconElement = document.createElement("img");
        downloadIconElement.src = DOWNLOAD_ICON_DATA_URL;
        downloadIconElement.alt = "Download";
        downloadIconElement.style.width = "13px";
        downloadIconElement.style.height = "13px";
        downloadIconElement.style.pointerEvents = "none";

        makeAccessibleButton(downloadTrackButton, `Download ${title}`);

        let isDownloadingTrack = false;
        downloadTrackButton.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();

          if (isDownloadingTrack) {
            return;
          }

          isDownloadingTrack = true;
          downloadIconElement.style.cursor = "wait";
          downloadIconElement.style.opacity = "0.5";

          const trackIndex = tracks.indexOf(matchingTrack);
          fetchTrackBlob(matchingTrack)
            .then(({ blob, extension }) => {
              const filename = sanitizeFilename(`${trackIndex + 1}. ${title}.${extension}`);
              triggerBlobDownload(blob, filename);
              showToast(`Downloaded "${title}"`);
            })
            .catch((error) => {
              console.error("Error downloading the track:", error);
              showToast(`Couldn't download "${title}"`, "error");
            })
            .finally(() => {
              isDownloadingTrack = false;
              downloadIconElement.style.cursor = "pointer";
              downloadIconElement.style.opacity = "1";
            });
        });

        playButton.appendChild(imgElement);
        playButton.appendChild(spinnerElement);
        downloadTrackButton.appendChild(downloadIconElement);
        cell.appendChild(audioElement); // no visual footprint, fine to leave here

        // Put the play/download buttons after the track's duration cell
        // (last <td> in the row) instead of overlapping the title, so they
        // read as "duration, then actions" rather than crowding the text.
        const row = cell.parentElement;
        const durationCell = row ? row.lastElementChild : null;

        if (durationCell && durationCell !== cell) {
          durationCell.classList.add("yap-track-actions");
          durationCell.appendChild(playButton);
          durationCell.appendChild(downloadTrackButton);
        } else {
          // Fallback for a row layout we don't recognize: keep the old
          // behavior of placing the buttons directly in the title cell.
          cell.style.paddingRight = "64px";
          cell.style.position = "relative";
          imgElement.style.position = "absolute";
          imgElement.style.right = "34px";
          imgElement.style.top = "52%";
          imgElement.style.transform = "translateY(-50%)";
          downloadTrackButton.style.position = "absolute";
          downloadTrackButton.style.right = "2px";
          downloadTrackButton.style.top = "52%";
          downloadTrackButton.style.transform = "translateY(-50%)";
          cell.style.position = "relative";
          cell.appendChild(playButton);
          cell.appendChild(downloadTrackButton);
        }
      }
    }
  });

  const cardAuthorDiv = document.querySelector("div.card-author");
  if (cardAuthorDiv && cardAuthorDiv.textContent.trim() === "Sharing paused") {
    // Redirect to the shareLinkUrl
    window.location.href = card.shareLinkUrl;
  }

  // Insert the new table after the .card-description div
  const cardDescriptionDiv = document.querySelector(".card-description");
  if (cardDescriptionDiv) {
    const infoTable = document.createElement("table");
    infoTable.className = "MuiTable-root css-1owb465";
    infoTable.style.margin = "0px auto 10px auto";
    infoTable.style.maxWidth = "525px";
    infoTable.style.textAlign = "center"; // Center the content

    infoTable.innerHTML = `
      <tbody class="MuiTableBody-root css-1xnox0e">
      <tr class="MuiTableRow-root css-1gqug66">
        <td class="MuiTableCell-root MuiTableCell-body MuiTableCell-sizeSmall css-1o6fzn1" id="clubAvailability" style="cursor:default;font-size:1em;font-weight:normal;border-bottom:0;text-align:center;font-family:'Castledown', sans-serif; min-width: 125px; line-height: 1.8;"></td>
        <td class="MuiTableCell-root MuiTableCell-body MuiTableCell-sizeSmall css-1o6fzn1" id="typeOfCard" style="cursor:default;font-size:1em;font-weight:normal;border-bottom:0;text-align:center;font-family:'Castledown', sans-serif; min-width: 157px; line-height: 1.8;"></td>
        <td class="MuiTableCell-root MuiTableCell-body MuiTableCell-sizeSmall css-1o6fzn1" id="durationCell" style="cursor:default;font-size:1em;font-weight:normal;border-bottom:0;text-align:center;font-family:'Castledown', sans-serif; min-width: 80px; line-height: 1.8;"></td>
        <td class="MuiTableCell-root MuiTableCell-body MuiTableCell-sizeSmall css-1o6fzn1" id="filesizeCell" style="cursor:default;font-size:1em;font-weight:normal;border-bottom:0;text-align:center;font-family:'Castledown', sans-serif; min-width: 90px; line-height: 1.8;"></td>
        </tr>
      </tbody>
    `;

    cardDescriptionDiv.insertAdjacentElement("afterend", infoTable);
  }

  // Fills one of the info-table cells with a "<b>Label</b><br>value" layout
  // without touching innerHTML, so no interpolated value (even though these
  // are only numbers/short strings today) is ever parsed as markup.
  function setLabelValue(elementId, label, value) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = "";
    const labelEl = document.createElement("b");
    labelEl.textContent = label;
    el.appendChild(labelEl);
    el.appendChild(document.createElement("br"));
    el.appendChild(document.createTextNode(value));
  }

  // Calculate and insert the Total Time, Total Size, and Club Availability
  const durationInSeconds = card.metadata.media.duration;
  const hours = Math.floor(durationInSeconds / 3600);
  const minutes = Math.floor((durationInSeconds % 3600) / 60);
  const seconds = durationInSeconds % 60;
  const formattedDuration =
    hours > 0
      ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
          .toString()
          .padStart(2, "0")}`
      : `${minutes}:${seconds.toString().padStart(2, "0")}`;
  setLabelValue("durationCell", "Total time", formattedDuration);

  const fileSizeInBytes = card.metadata.media.fileSize;
  const fileSizeInMB = (fileSizeInBytes / (1024 * 1024)).toFixed(2);
  setLabelValue("filesizeCell", "Total size", `${fileSizeInMB} MB`);

  const clubAvailability = card.clubAvailability || [];
  const storeFlags = {
    UK: "🇬🇧",
    US: "🇺🇸",
    CA: "🇨🇦",
    AU: "🇦🇺",
    EU: "🇪🇺",
  };
  // Declared here (not inside the `if` below) so it's always defined when
  // read further down while building the "Type of card" cell.
  let storeCodes = [];
  if (clubAvailability.length > 0) {
    storeCodes = clubAvailability
      .map(function (store) {
        if (store.store.toUpperCase() === "DEV") return null;
        return (
          storeFlags[store.store.toUpperCase()] || store.store.toUpperCase()
        );
      })
      .filter(Boolean);
  }

  if (storeCodes.length > 0) {
    setLabelValue("clubAvailability", "Club Availability", storeCodes.join(", "));

    // Add the club badge inside the .card div
    const cardDiv = document.querySelector(".card");
    if (cardDiv) {
      const badgeTriangle = document.createElement("div");
      badgeTriangle.style.cssText =
        "width:0;height:0;border-color:#0000 #0000 #75e3b0;border-style:solid;border-width:0 0px 52px 52px;position:relative;top:-56px;right:-110px;border-radius:0 0 8px 0;";

      const badgeIcon = document.createElement("img");
      badgeIcon.src = "https://www.datocms-assets.com/48136/1660910450-club-icon.png";
      badgeIcon.style.cssText = "position:relative;top:-84px;right:-64px;width:22px;height:22px;";

      cardDiv.appendChild(badgeTriangle);
      cardDiv.appendChild(badgeIcon);
    }
  } else {
    setLabelValue("clubAvailability", "Club Availability", "Not available");
  }

  // Official cards are sold in the Yoto shop. Show a link per region, with the
  // price and availability when the card's product page can be found.
  //  - Club cards list the regions they are available in, so one link per
  //    region is shown straight away (a shop search for the title) and later
  //    upgraded to the product page.
  //  - Other official cards (userId "yoto") don't say where they are sold, so
  //    every shop is checked and only the regions that have the product are
  //    shown; if none does, a single search link is offered.
  const SHOP_REGIONS = ["eu", "uk", "us", "ca", "au"];
  const clubRegions = clubAvailability
    .map((store) => store.store.toLowerCase())
    .filter((code, i, all) => SHOP_REGIONS.includes(code) && all.indexOf(code) === i);
  const isOfficialCard = clubRegions.length > 0 || card.userId === "yoto";

  if (isOfficialCard && card.title) {
    const infoTableBody = document.querySelector("#clubAvailability")
      ?.closest("tbody");
    if (infoTableBody) {
      const shopRow = document.createElement("tr");
      const shopCell = document.createElement("td");
      shopCell.colSpan = 4;
      shopCell.style.cssText =
        "border-bottom:0;text-align:center;font-family:'Castledown', sans-serif;";
      shopRow.appendChild(shopCell);
      infoTableBody.appendChild(shopRow);

      const extensionApi = typeof browser !== "undefined" ? browser : chrome;
      const knownRegions = clubRegions.length > 0;
      const regionsToCheck = knownRegions ? clubRegions : SHOP_REGIONS;

      const searchUrl = (region) =>
        `https://${region}.yotoplay.com/collections/library?q=` +
        encodeURIComponent(card.title) +
        "&prioritiseAvailableForSaleInSearch=20&collectionSlugs=library";

      const formatPrice = (product) => {
        try {
          return new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: product.currency,
          }).format(product.price);
        } catch (e) {
          return product.price.toFixed(2);
        }
      };

      const lookupProduct = (region) => {
        try {
          return Promise.resolve(
            extensionApi.runtime.sendMessage({
              type: "yap-shop-product",
              region,
              title: card.title,
            })
          )
            .then((response) => (response && response.product) || null)
            .catch(() => null);
        } catch (e) {
          // No extension messaging available.
          return Promise.resolve(null);
        }
      };

      // products: region -> product (or null when not found / not checked yet)
      const render = (products, done) => {
        shopCell.textContent = "";

        let shown = knownRegions
          ? regionsToCheck
          : regionsToCheck.filter((region) => products[region]);

        // Unknown availability and nothing found: one search link, only once
        // every lookup has finished.
        const fallback = !knownRegions && shown.length === 0 && done;
        if (fallback) shown = [regionsToCheck[0]];

        shopRow.style.display = shown.length === 0 ? "none" : "";
        if (shown.length === 0) return;

        shopCell.appendChild(
          document.createTextNode(
            fallback ? "Search in the Yoto shop: " : "Find in the Yoto shop: "
          )
        );
        shown.forEach((region, i) => {
          if (i > 0) shopCell.appendChild(document.createTextNode(" · "));
          const product = products[region];
          const link = document.createElement("a");
          link.href = product ? product.url : searchUrl(region);
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.style.cssText = "color:inherit;text-decoration:underline;";

          let text = `${storeFlags[region.toUpperCase()]} ${region.toUpperCase()}`;
          if (product) {
            const details = [formatPrice(product)];
            if (!product.availableForSale) details.push("out of stock");
            text += ` ${details.join(", ")}`;
          }
          link.textContent = text;
          shopCell.appendChild(link);
        });
      };

      const products = {};
      render(products, false);

      Promise.all(
        regionsToCheck.map((region) =>
          lookupProduct(region).then((product) => {
            products[region] = product;
            render(products, false);
          })
        )
      ).then(() => render(products, true));
    }
  }

  // Check if any query parameter starts with "g4"
  const queryParams = jsonData.query || {};
  const typeOfCard = Object.keys(queryParams).some((key) => key.startsWith("g4"));

  if (typeOfCard && storeCodes.length > 0) {
    setLabelValue("typeOfCard", "Type of card", "Yoto Club digital card");
  } else if (!typeOfCard) {
    setLabelValue("typeOfCard", "Type of card", "Premium audio");
  } else {
    setLabelValue("typeOfCard", "Type of card", "Playlist");
  }

  // Replace the image
  const downloadElement = document.querySelector(
    'img[src="/img/player/AppIcon.png"]'
  );
  if (downloadElement) {
    downloadElement.src =
      "https://www.datocms-assets.com/48136/1670930475-parental-control.png";
    downloadElement.alt = "Download";
    downloadElement.style.cursor = "pointer";
    downloadElement.style.width = "60px";

    makeAccessibleButton(
      downloadElement,
      "Download audio, icons and cover as a ZIP file"
    );

    // Trigger the ZIP download when the footer icon is clicked. A large
    // card can take a few seconds to fetch and zip, so the icon is disabled
    // and shows a busy cursor while it works, both as feedback for the
    // person and to stop a second click from starting a duplicate download.
    // A toast confirms whether it finished cleanly or something failed,
    // instead of leaving that only in the console.
    let isDownloading = false;
    downloadElement.addEventListener("click", () => {
      if (isDownloading) {
        return;
      }

      isDownloading = true;
      downloadElement.style.cursor = "wait";
      downloadElement.style.opacity = "0.6";
      downloadElement.setAttribute("aria-busy", "true");

      downloadCardZip()
        .then(({ failures }) => {
          if (failures.length > 0) {
            showToast(
              `ZIP downloaded, but ${failures.length} file(s) couldn't be fetched`,
              "error"
            );
          } else {
            showToast("Download complete");
          }
        })
        .catch((error) => {
          console.error("Error generating the download:", error);
          showToast("Couldn't generate the download", "error");
        })
        .finally(() => {
          isDownloading = false;
          downloadElement.style.cursor = "pointer";
          downloadElement.style.opacity = "1";
          downloadElement.removeAttribute("aria-busy");
        });
    });
  }

  // Replace the text "Want to add this card to your Yoto library?"
  const firstText = document.querySelector("h3");
  if (
    firstText &&
    firstText.textContent.includes(
      "Want to add this card to your Yoto library?"
    )
  ) {
    firstText.textContent = "Want to save this content?";
    firstText.style.fontFamily = "Castledown";
    firstText.style.fontSize = "22px";
  }

  // Replace the text "Download the free Yoto App and tap the card on your mobile"
  const secondText = document.querySelector("div.MuiGrid-grid-xs-9");
  if (
    secondText &&
    secondText.textContent.includes(
      "Download the free Yoto App and tap the card on your mobile"
    )
  ) {
    secondText.textContent =
      "Click here to download the audio, icons and cover on your computer or smartphone.";
    secondText.appendChild(document.createElement("br"));
    secondText.style.fontFamily = "Castledown";
    secondText.style.fontSize = "17px";
  }

  // Hide the div with class="player-controls"
  const playerControls = document.querySelector(".player-controls");
  if (playerControls) {
    playerControls.style.display = "none";
  }

  // Hide the divs with class="MuiGrid-grid-xs-6"
  const gridDivs = document.querySelectorAll("div.MuiGrid-grid-xs-6");
  gridDivs.forEach((div) => {
    div.style.display = "none";
  });

  // Hide the divs with class="MuiGrid-root MuiGrid-item MuiGrid-grid-xs-4 css-1udb513"
  const gridXs4Divs = document.querySelectorAll("div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-4.css-1udb513");
  gridXs4Divs.forEach((div) => {
    div.style.display = "none";
  });

  // Add margin-top to the div with class="card-title"
  const cardTitleDiv = document.querySelector(".card-title");
  if (cardTitleDiv) {
    cardTitleDiv.style.marginTop = "40px";
  }

  // Adjust padding-bottom to the div with class="playerBody"
  const playerBody = document.querySelector("div.playerBody");
  if (playerBody) {
    playerBody.style.paddingBottom = "80px";
  }

  // Apply padding-bottom style to the element with the class='css-b5x8ma'
  const targetb5x8ma = document.querySelector(".css-b5x8ma");
  if (targetb5x8ma) {
    targetb5x8ma.style.paddingBottom = "8px";
  }

  // Apply padding-bottom style to the element with the class='css-1udb513'
  const cardStyle = document.querySelector(".card");
  if (cardStyle) {
    cardStyle.style.width = "162px";
    cardStyle.style.height = "258px";
  }
}
