import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import * as faceapi from 'face-api.js';
import { CommonModule } from '@angular/common';
import { WebcamImage, WebcamModule } from 'ngx-webcam';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, WebcamModule, MatProgressSpinnerModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  @ViewChild('canvasElement', { static: false }) canvasElement:
    | ElementRef
    | undefined;
  webcamImage: WebcamImage | any = null;
  canvas: HTMLCanvasElement | any;
  video: HTMLVideoElement | any;
  hasTakenPhoto: boolean = false;
  MIN_FACE_AREA_PERCENTAGE = 0.1; // Adjust this threshold as needed

  private faceShapeWidth = 200;
  private faceShapeHeight = 250;
  private centerX: number = 320; // Canvas width / 2
  private centerY: number = 240; // Canvas height / 2
  isLoading: boolean = false;
  private scanningY: number = 0;
  private scanningDirection: number = 1; // 1: moving down; -1: moving up
  showKeepFaceMsg: boolean = false;

  constructor() { }

  ngOnInit(): void {
    this.isLoading = true;
    this.loadModels();
  }

  // Load face-api.js models
  async loadModels(): Promise<void> {
    try {
      await faceapi.nets.ssdMobilenetv1.loadFromUri('/assets/models');
      await faceapi.nets.faceLandmark68Net.loadFromUri('/assets/models');
      await faceapi.nets.faceRecognitionNet.loadFromUri('/assets/models');
      console.log('Models loaded successfully');
      this.startWebcam();
    } catch (error) {
      console.error('Error loading models:', error);
    }
  }

  startWebcam(): void {
    this.video = document.createElement('video');

    navigator.mediaDevices
      .getUserMedia({ video: {} })
      .then((stream) => {
        this.video.srcObject = stream;
        this.video.play();
        this.video.onloadeddata = () => {
          this.isLoading = false;
          this.showKeepFaceMsg = true;
          this.canvas = faceapi.createCanvasFromMedia(this.video);
          // Append the canvas to the element referenced by #canvasElement in your template
          this.canvasElement?.nativeElement.append(this.canvas);
          // Set initial canvas dimensions if needed (should be 640 x 480)
          this.canvas.width = 640;
          this.canvas.height = 480;
          // Recalculate the center based on the canvas dimensions
          this.centerX = this.canvas.width / 2;
          this.centerY = this.canvas.height / 2;
          // Initialize scanningY at the top of the oval
          this.scanningY = this.centerY - this.faceShapeHeight / 2;
          // Start the scanning animation
          this.animateScanningEffect();
          // Optionally, start detection loop
          this.detectFaceAndDrawLandmarks();
        };
      })
      .catch((err) => {
        console.error('Error accessing camera', err);
      });
  }

  async detectFaceAndDrawLandmarks(): Promise<void> {
    if (!this.video) return;

    const detections = await faceapi
      .detectAllFaces(this.video)
      .withFaceLandmarks()

    if (!this.canvas) return;
    const context = this.canvas.getContext('2d');
    if (context) {
      context.clearRect(0, 0, this.canvas.width, this.canvas.height); // Clear previous drawings
    }

    faceapi.matchDimensions(this.canvas, { width: 640, height: 480 });
    const resizedDetections: any = faceapi.resizeResults(detections, {
      width: 640,
      height: 480,
    });

    // Check if a full face is detected within the oval boundary
    const fullFaceDetected = this.isFullFaceWithinOval(resizedDetections);

    // If a full face is detected, schedule a photo capture after 3 seconds
    if (fullFaceDetected && !this.hasTakenPhoto) {
      this.hasTakenPhoto = true; // Set flag to prevent further photo captures
      this.takePhoto(); // Capture the photo
    }

    if (!this.hasTakenPhoto)
      requestAnimationFrame(() => this.detectFaceAndDrawLandmarks());
  }

  // Function to draw an oval face shape watermark on the canvas
  drawFaceShapeWatermark(): void {
    if (!this.canvas) return;
    const context = this.canvas.getContext('2d');
    if (!context) return;

    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    // Use predefined watermark dimensions
    const watermarkWidth = this.faceShapeWidth;
    const watermarkHeight = this.faceShapeHeight;
    // Calculate center (should be set in startWebcam)
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;

    // Clear previous drawings if needed
    context.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw the oval watermark border
    context.beginPath();
    if (typeof context.ellipse === 'function') {
      context.ellipse(centerX, centerY, watermarkWidth / 2, watermarkHeight / 2, 0, 0, 2 * Math.PI);
    } else {
      context.arc(centerX, centerY, Math.min(watermarkWidth, watermarkHeight) / 2, 0, 2 * Math.PI);
    }
    context.closePath();
    context.lineWidth = 3;
    context.strokeStyle = 'rgba(255, 0, 0, 0.5)';
    context.setLineDash([5, 5]);
    context.stroke();
  }

  // Animate the scanning effect inside the oval watermark
  animateScanningEffect(): void {
    if (!this.canvas) return;
    const context = this.canvas.getContext('2d');
    if (!context) return;

    // Use the current canvas dimensions and watermark settings
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    const watermarkWidth = this.faceShapeWidth;
    const watermarkHeight = this.faceShapeHeight;
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;

    // Update scanningY so that it moves between the top and bottom of the oval
    const minY = centerY - watermarkHeight / 2;
    const maxY = centerY + watermarkHeight / 2 - 10; // 10 pixels is the scanning line height
    this.scanningY += this.scanningDirection * 2; // move 2 pixels per frame
    if (this.scanningY > maxY || this.scanningY < minY) {
      this.scanningDirection *= -1; // reverse direction
      // Clamp scanningY within bounds
      this.scanningY = Math.max(minY, Math.min(this.scanningY, maxY));
    }

    // Redraw the watermark border first
    this.drawFaceShapeWatermark();

    // Draw scanning effect inside the oval
    context.save();
    context.beginPath();
    if (typeof context.ellipse === 'function') {
      context.ellipse(centerX, centerY, watermarkWidth / 2, watermarkHeight / 2, 0, 0, 2 * Math.PI);
    } else {
      context.arc(centerX, centerY, Math.min(watermarkWidth, watermarkHeight) / 2, 0, 2 * Math.PI);
    }
    context.clip();

    // Draw the scanning line (a semi-transparent rectangle)
    context.fillStyle = 'rgba(0, 255, 0, 0.3)';
    // The scanning line covers the entire width of the watermark region.
    context.fillRect(centerX - watermarkWidth / 2, this.scanningY, watermarkWidth, 10);
    context.restore();
    if (!this.hasTakenPhoto)
      requestAnimationFrame(() => this.animateScanningEffect());
  }

  // Check if a full face is detected within the oval boundary
  private isFullFaceWithinOval(detections: any[]): boolean {
    if (detections.length === 0) return false;

    for (const detection of detections) {
      const { width, height, x, y } = detection.detection.box;
      const faceArea = width * height;
      const canvasArea = this.canvas.width * this.canvas.height;

      // Check if the detected face occupies a minimum portion of the canvas area
      if (faceArea / canvasArea >= this.MIN_FACE_AREA_PERCENTAGE) {
        // Check if the face is within the oval
        if (this.isFaceWithinOval(x + width / 2, y + height / 2)) {
          // Optionally, check if we have enough landmarks detected (optional)
          if (detection.landmarks.positions.length >= 68) {
            return true; // Full face detected within oval
          }
        }
      }
    }

    return false; // No full face detected within the oval
  }

  // Check if the face's center (x, y) is within the oval region
  private isFaceWithinOval(faceCenterX: number, faceCenterY: number): boolean {
    // Use the equation for an ellipse (oval) to check if the point is inside
    const dx = (faceCenterX - this.centerX) / (this.faceShapeWidth / 2);
    const dy = (faceCenterY - this.centerY) / (this.faceShapeHeight / 2);

    // Check if the face center is inside the oval
    return dx * dx + dy * dy <= 1;
  }

  // Take a photo when clicked and send it to the backend
  takePhoto(): void {
    this.showKeepFaceMsg = false;
    // Function to crop the image inside the watermark (oval)
    if (!this.video || !this.canvas) return;

    // Define watermark (oval) dimensions
    const watermarkWidth = 300;
    const watermarkHeight = 350;
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;

    // Create a new canvas for the cropped image
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = watermarkWidth;
    croppedCanvas.height = watermarkHeight;
    const ctx = croppedCanvas.getContext('2d');
    if (!ctx) return;

    // Save context state
    ctx.save();

    // Define the oval clipping path on the cropped canvas
    ctx.beginPath();
    if (typeof ctx.ellipse === 'function') {
      ctx.ellipse(
        watermarkWidth / 2,        // center x in cropped canvas
        watermarkHeight / 2,       // center y in cropped canvas
        watermarkWidth / 2,        // x-radius
        watermarkHeight / 2,       // y-radius
        0,                         // rotation
        0,                         // start angle
        2 * Math.PI                // end angle
      );
    } else {
      ctx.arc(
        watermarkWidth / 2,
        watermarkHeight / 2,
        Math.min(watermarkWidth, watermarkHeight) / 2,
        0,
        2 * Math.PI
      );
    }
    ctx.clip();

    // Draw the portion of the video corresponding to the watermark region.
    // Calculate the top-left corner of the cropping region based on the canvas center.
    const sourceX = centerX - watermarkWidth / 2;
    const sourceY = centerY - watermarkHeight / 2;

    ctx.drawImage(
      this.video,
      sourceX,            // source x in video
      sourceY,            // source y in video
      watermarkWidth,     // source width
      watermarkHeight,    // source height
      0,                  // destination x on cropped canvas
      0,                  // destination y on cropped canvas
      watermarkWidth,     // destination width
      watermarkHeight     // destination height
    );

    // Restore the context (remove clipping)
    ctx.restore();

    // Convert the cropped canvas to a data URL (base64 image)
    const croppedDataUrl = croppedCanvas.toDataURL('image/jpeg');
    this.webcamImage = { imageAsDataUrl: croppedDataUrl };
    setTimeout(() => {
      this.identifyImage(croppedDataUrl)

    }, 2000);
  }

  async identifyImage(croppedDataUrl: any) {
    const croppedImage = new Image();
    croppedImage.src = croppedDataUrl;

    // Use face-api.js to detect a face in the cropped image
    try {
      const detection = await faceapi
        .detectSingleFace(croppedImage)
        .withFaceLandmarks()

      if (!detection) {
        // No face was detected in the cropped image.
        this.showKeepFaceMsg = true;
        console.warn('No face detected. Please keep your face inside the frame.');
      } else {
        // Face detected; optionally, you can log or process detection further.
        this.showKeepFaceMsg = false;
        console.log('Face detected:', detection);
      }
    }
    catch (e: any) {

    }
    const context = this.canvas.getContext('2d');
    if (context) {
      context.clearRect(0, 0, this.canvas.width, this.canvas.height); // Clear previous drawings
    }
  }
}
