// Locate the script element containing the JSON data
const scriptElement = document.querySelector("script#__NEXT_DATA__");

if (scriptElement) {
  // Parse the JSON content of the script element
  const jsonData = JSON.parse(scriptElement.textContent);

  // Access the chapters and tracks from the parsed JSON
  const chapters = jsonData.props.pageProps.card.content.chapters;

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

  // Find all table cells (<td>) that contain track titles in the HTML
  const tableCells = document.querySelectorAll("td.MuiTableCell-root");

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

        const imgElement = document.createElement("img");
        imgElement.src = "https://share.yoto.co/img/player/play.png";
        imgElement.alt = "Play";
        imgElement.style.width = "26px";
        imgElement.style.height = "28px";
        imgElement.style.position = "absolute";
        imgElement.style.right = "1px";
        imgElement.style.top = "52%";
        imgElement.style.transform = "translateY(-50%)";
        imgElement.style.cursor = "pointer";

        const downloadElement = document.createElement("a");

        let isPlaying = false;
        playButton.addEventListener("click", function (e) {
          e.preventDefault();

          if (isPlaying) {
            audioElement.pause();
            imgElement.src = "https://share.yoto.co/img/player/play.png";
            isPlaying = false;
          } else {
            audioElement.play();
            imgElement.src = "https://share.yoto.co/img/player/pause.png";
            isPlaying = true;
          }

          audioElement.onended = function () {
            imgElement.src = "https://share.yoto.co/img/player/play.png";
            isPlaying = false;
          };
        });

        // Add event listener to trigger download
        downloadElement.addEventListener("click", () => {
          const zip = new JSZip();
          const audioFolder = zip.folder("audio_files");
          const imageFolder = zip.folder("image_files");

          const mimeToExtension = {
            "audio/mpeg": "mp3",
            "audio/wav": "wav",
            "audio/mp4": "m4a",
          };

          const trackPromises = tracks.map((track, index) => {
            return fetch(track.url)
              .then((response) => {
                const contentType = response.headers.get("Content-Type");
                const extension = mimeToExtension[contentType] || "m4a"; // Get the extension from the Content-Type
                return response.blob().then((blob) => {
                  audioFolder.file(
                    `${index + 1}. ${track.title}.${extension}`,
                    blob
                  ); // Use the index and title for the file name
                });
              })
              .catch((error) =>
                console.error("Error downloading the file:", error)
              );
          });

          // Fetch the cover image
          const imagePromise = fetch(
            jsonData.props.pageProps.card.content.cover.imageL
          )
            .then((response) => response.blob())
            .then((blob) => {
              imageFolder.file("cover_image.png", blob);
            })
            .catch((error) =>
              console.error("Error downloading the cover image:", error)
            );

          // Fetch images for each track
          const trackImagePromises = tracks.map((track, index) => {
            const imageUrl =
              jsonData.props.pageProps.card.content.chapters[index].display
                .icon16x16;
            return fetch(imageUrl)
              .then((response) => response.blob())
              .then((blob) => {
                imageFolder.file(`${index + 1}. ${track.title}.png`, blob); // Use the index and title for the image file name
              })
              .catch((error) =>
                console.error("Error downloading the track image:", error)
              );
          });

          Promise.all([
            ...trackPromises,
            imagePromise,
            ...trackImagePromises,
          ]).then(() => {
            zip.generateAsync({ type: "blob" }).then((content) => {
              const url = window.URL.createObjectURL(content);
              const anchor = document.createElement("a");
              anchor.href = url;

              // Get the title of the webpage
              let pageTitle = document.title;

              // Replace invalid filename characters
              let sanitizedTitle = pageTitle.replace(/[^a-z0-9]/gi, "_");

              // Set the download attribute
              anchor.download = `${sanitizedTitle}.zip`;

              anchor.click();
              window.URL.revokeObjectURL(url);
            });
          });
        });

        cell.style.paddingRight = "32px";
        cell.style.position = "relative";
        cell.appendChild(playButton);
        playButton.appendChild(imgElement);
        cell.appendChild(audioElement);
      }
    }
  });

  const cardAuthorDiv = document.querySelector("div.card-author");
  if (cardAuthorDiv && cardAuthorDiv.textContent.trim() === "Sharing paused") {
    // Redirect to the shareLinkUrl
    const shareLinkUrl = jsonData.props.pageProps.card.shareLinkUrl;
    window.location.href = shareLinkUrl;
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
        <td class="MuiTableCell-root MuiTableCell-body MuiTableCell-sizeSmall css-1o6fzn1" id="clubAvailability" style="cursor:default;font-size:1em;font-weight:normal;border-bottom:0;text-align:center;font-family:'Castledown', sans-serif;"><b>Club Availability:</b></td>
        <td class="MuiTableCell-root MuiTableCell-body MuiTableCell-sizeSmall css-1o6fzn1" id="storeLink:" style="cursor:default;font-size:1em;font-weight:normal;border-bottom:0;text-align:center;font-family:'Castledown', sans-serif;"><b>Buy this card:</b></td>
        <td class="MuiTableCell-root MuiTableCell-body MuiTableCell-sizeSmall css-1o6fzn1" id="durationCell" style="cursor:default;font-size:1em;font-weight:normal;border-bottom:0;text-align:center;font-family:'Castledown', sans-serif;"><b>Total time:</b></td>
        <td class="MuiTableCell-root MuiTableCell-body MuiTableCell-sizeSmall css-1o6fzn1" id="filesizeCell" style="cursor:default;font-size:1em;font-weight:normal;border-bottom:0;text-align:center;font-family:'Castledown', sans-serif;"><b>Total size:</b></td>
        </tr>
      </tbody>
    `;

    cardDescriptionDiv.insertAdjacentElement("afterend", infoTable);
  }

  // Calculate and insert the Total Time, Total Size, and Club Availability
  var durationInSeconds = jsonData.props.pageProps.card.metadata.media.duration;
  var hours = Math.floor(durationInSeconds / 3600);
  var minutes = Math.floor((durationInSeconds % 3600) / 60);
  var seconds = durationInSeconds % 60;
  var formattedDuration =
    hours > 0
      ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
          .toString()
          .padStart(2, "0")}`
      : `${minutes}:${seconds.toString().padStart(2, "0")}`;
  document.getElementById(
    "durationCell"
  ).innerHTML = `<b>Total time</b><br>${formattedDuration}`;

  var fileSizeInBytes = jsonData.props.pageProps.card.metadata.media.fileSize;
  var fileSizeInMB = (fileSizeInBytes / (1024 * 1024)).toFixed(2);
  document.getElementById(
    "filesizeCell"
  ).innerHTML = `<b>Total size</b><br>${fileSizeInMB} MB`;

  var clubAvailability = jsonData.props.pageProps.card.clubAvailability || [];
  var storeFlags = {
    UK: "🇬🇧",
    US: "🇺🇸",
    CA: "🇨🇦",
    AU: "🇦🇺",
    EU: "🇪🇺",
  };
  if (clubAvailability.length > 0) {
    var storeCodes = clubAvailability
      .map(function (store) {
        if (store.store.toUpperCase() === "DEV") return null;
        return (
          storeFlags[store.store.toUpperCase()] || store.store.toUpperCase()
        );
      })
      .filter(Boolean);
    if (storeCodes.length > 0) {
      document.getElementById("clubAvailability").innerHTML =
        "<b>Club Availability</b><br>" + storeCodes.join(", ");
    } else {
      document.getElementById("clubAvailability").style.display = "none";
    }
  }

  var sortkey = jsonData.props.pageProps.card.sortkey.replace(/-/g, "+");
  var author = jsonData.props.pageProps.card.metadata.author.replace(/ /g, "+");

  // Check if any query parameter starts with "g4"
  var queryParams = jsonData.query;
  var hideBuyCard = Object.keys(queryParams).some(
    (key) => key.startsWith("g4") || key.startsWith("token")
  );

  if (!hideBuyCard) {
    var sortkey = jsonData.props.pageProps.card.sortkey.replace(/-/g, "+");
    var author = jsonData.props.pageProps.card.metadata.author.replace(
      / /g,
      "+"
    );
    document.getElementById(
      "storeLink:"
    ).innerHTML = `<b>Buy this card</b> <br><a href="https://yotoplay.com/collections/library?q=${sortkey}&author=${author}" target="_blank" style="text-decoration: none; color: inherit;">Yoto Card Store</a>`;
  } else {
    document.getElementById("storeLink:").style.display = "none";
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
  }

  // Assuming the footer download button has been selected
  const footerDownloadButton = downloadElement;

  // Add event listener to trigger download for the footer button
  footerDownloadButton.addEventListener("click", () => {
    const zip = new JSZip();
    const audioFolder = zip.folder("audio_files");
    const imageFolder = zip.folder("image_files");

    const mimeToExtension = {
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
      "audio/mp4": "m4a",
    };

    const trackPromises = tracks.map((track, index) => {
      return fetch(track.url)
        .then((response) => {
          const contentType = response.headers.get("Content-Type");
          const extension = mimeToExtension[contentType] || "m4a"; // Get the extension from the Content-Type
          return response.blob().then((blob) => {
            audioFolder.file(`${index + 1}. ${track.title}.${extension}`, blob); // Use the index and title for the file name
          });
        })
        .catch((error) => console.error("Error downloading the file:", error));
    });

    // Fetch the cover image
    const imagePromise = fetch(
      jsonData.props.pageProps.card.content.cover.imageL
    )
      .then((response) => response.blob())
      .then((blob) => {
        imageFolder.file("cover_image.png", blob);
      })
      .catch((error) =>
        console.error("Error downloading the cover image:", error)
      );

    // Fetch images for each track
    const trackImagePromises = tracks.map((track, index) => {
      const imageUrl =
        jsonData.props.pageProps.card.content.chapters[index].display.icon16x16;
      return fetch(imageUrl)
        .then((response) => response.blob())
        .then((blob) => {
          imageFolder.file(`${index + 1}. ${track.title}.png`, blob); // Use the index and title for the image file name
        })
        .catch((error) =>
          console.error("Error downloading the track image:", error)
        );
    });

    Promise.all([...trackPromises, imagePromise, ...trackImagePromises]).then(
      () => {
        zip.generateAsync({ type: "blob" }).then((content) => {
          const url = window.URL.createObjectURL(content);
          const anchor = document.createElement("a");
          anchor.href = url;

          // Get the title of the webpage
          let pageTitle = document.title;

          // Replace invalid filename characters
          let sanitizedTitle = pageTitle.replace(/[<>:"/\\|?*]/g, "").trim();

          // Set the download attribute
          anchor.download = `${sanitizedTitle}.zip`;

          anchor.click();
          window.URL.revokeObjectURL(url);
        });
      }
    );
  });

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
    secondText.innerHTML =
      "Click here to download the audio, icons and cover on your computer or smartphone.<br>";
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

  // Add margin-top to the div with class="card-title"
  const cardTitleDiv = document.querySelector(".card-title");
  if (cardTitleDiv) {
    cardTitleDiv.style.marginTop = "40px";
  }

  // Adjust padding-bottom to the div with class="playerBody"
  const playerBody = document.querySelector("div.playerBody");
  if (playerBody) {
    playerBody.style.paddingBottom = "70px";
  }

  // Select the element with the class css-b5x8ma
  const targetb5x8ma = document.querySelector(".css-b5x8ma");

  // Apply padding-bottom style
  if (targetb5x8ma) {
    targetb5x8ma.style.paddingBottom = "8px";
  }
}