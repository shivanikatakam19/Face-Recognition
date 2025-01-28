import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import * as faceapi from 'face-api.js';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { WebcamImage, WebcamModule } from 'ngx-webcam';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, HttpClientModule, WebcamModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  @ViewChild('canvasElement', { static: false }) canvasElement:
    | ElementRef
    | undefined;
  webcamImage: WebcamImage | any = null;
  videoStarted: boolean = false;
  canvas: HTMLCanvasElement | any;
  video: HTMLVideoElement | any;
  hasTakenPhoto: boolean = false;
  // Minimum face area percentage of the canvas size to consider as a "full face"
  MIN_FACE_AREA_PERCENTAGE = 0.1; // Adjust this threshold as needed

  private faceShapeWidth = 200;
  private faceShapeHeight = 250;
  private centerX: number = 320; // Canvas width / 2
  private centerY: number = 240; // Canvas height / 2

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
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

  // Start webcam
  startWebcam(): void {
    this.video = document.createElement('video');
    this.video.width = 640;
    this.video.height = 480;

    navigator.mediaDevices
      .getUserMedia({ video: {} })
      .then((stream) => {
        this.video.srcObject = stream;
        this.video.play();
        this.video.onloadeddata = () => {
          this.canvas = faceapi.createCanvasFromMedia(this.video);
          this.canvasElement?.nativeElement.append(this.canvas);
          this.detectFaceAndDrawLandmarks();
        };
      })
      .catch((err) => {
        console.error('Error accessing camera', err);
      });
  }

  // Detect faces and draw the watermark
  async detectFaceAndDrawLandmarks(): Promise<void> {
    if (!this.video) return;

    const detections = await faceapi
      .detectAllFaces(this.video)
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (!this.canvas) return;
    const context = this.canvas.getContext('2d');
    if (context) {
      context.clearRect(0, 0, this.canvas.width, this.canvas.height); // Clear previous drawings
    }

    faceapi.matchDimensions(this.canvas, { width: 640, height: 480 });
    const resizedDetections = faceapi.resizeResults(detections, {
      width: 640,
      height: 480,
    });

    // remove the face draw detections from the identified face

    // resizedDetections.forEach((detection) => {
    // Draw the face landmarks
    //   faceapi.draw.drawDetections(this.canvas, [detection]);
    //   faceapi.draw.drawFaceLandmarks(this.canvas, [detection]);
    // });

    // Draw the static watermark face shape (oval)
    this.drawFaceShapeWatermark();

    // Check if a full face is detected
    const fullFaceDetected = this.isFullFaceWithinOval(resizedDetections);

    // Automatically take a photo only if a full face is detected and photo has not been taken yet
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

    // Define the size and position of the watermark
    const faceShapeWidth = 200;
    const faceShapeHeight = 250;
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;

    // Draw the oval watermark
    context.beginPath();
    context.ellipse(
      centerX,
      centerY,
      faceShapeWidth / 2,
      faceShapeHeight / 2,
      0,
      0,
      2 * Math.PI
    );
    context.closePath();
    context.lineWidth = 3;
    context.strokeStyle = 'rgba(255, 0, 0, 0.5)'; // Semi-transparent red stroke
    context.setLineDash([5, 5]); // Dashed line for watermark
    context.stroke();
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
    if (this.canvas && this.video) {
      // Define the watermark bounds (size and position)
      const faceShapeWidth = 200;
      const faceShapeHeight = 250;
      const centerX = this.canvas.width / 2;
      const centerY = this.canvas.height / 2;

      // Crop the image inside the watermark area (oval)
      const croppedCanvas = document.createElement('canvas');
      const croppedContext = croppedCanvas.getContext('2d');
      if (croppedContext) {
        // Set the cropping size to the watermark's size
        croppedCanvas.width = faceShapeWidth;
        croppedCanvas.height = faceShapeHeight;

        // Draw the face portion inside the watermark bounds
        croppedContext.drawImage(
          this.video,
          centerX - faceShapeWidth / 2,
          centerY - faceShapeHeight / 2, // Source (cropping region)
          faceShapeWidth,
          faceShapeHeight, // Source size
          0,
          0,
          faceShapeWidth,
          faceShapeHeight // Target (cropped region)
        );

        // Convert cropped face to base64 image
        const croppedFaceBase64 = croppedCanvas.toDataURL('image/jpeg');

        // Display the captured image
        this.webcamImage = { imageAsDataUrl: croppedFaceBase64 };

        // Send to the backend
        this.sendFaceToBackend(croppedFaceBase64);
      }
    }
  }

  // Send the cropped face image to the backend
  sendFaceToBackend(croppedFaceBase64: string): void {
    const formData = new FormData();
    formData.append('face', croppedFaceBase64);

    this.http.post('your-backend-endpoint', formData).subscribe(
      (response: any) => {
        console.log('Successfully sent face to backend:', response);
      },
      (error: any) => {
        console.error('Error sending face to backend:', error);
      }
    );
  }
}
