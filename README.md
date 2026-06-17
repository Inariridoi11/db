package com.lastandfast.dbizi

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.YuvImage
import androidx.annotation.OptIn
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.min

/**
 * Analiza cada frame: ML Kit lee el texto, se filtran números de 3-4 cifras,
 * y se clasifica el color del cuadro alrededor del número (verde / azul).
 */
class BikeAnalyzer(
    private val onResults: (imgW: Int, imgH: Int, results: List<BikeResult>) -> Unit
) : ImageAnalysis.Analyzer {

    private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    private val numRegex = Regex("\\d{3,4}")

    @OptIn(ExperimentalGetImage::class)
    override fun analyze(image: ImageProxy) {
        val media = image.image
        if (media == null) { image.close(); return }
        val rot = image.imageInfo.rotationDegrees
        val input = InputImage.fromMediaImage(media, rot)
        val bmp = toUprightBitmap(image, rot)   // mismo espacio que las coords de ML Kit

        recognizer.process(input)
            .addOnSuccessListener { text ->
                val out = LinkedHashMap<Int, BikeResult>()
                for (block in text.textBlocks) for (line in block.lines) {
                    val box = line.boundingBox ?: continue
                    for (m in numRegex.findAll(line.text)) {
                        val n = m.value.toIntOrNull() ?: continue
                        if (n < 1 || n > 9999) continue
                        val color = if (bmp != null) classifyColor(bmp, box) else 2
                        val isTarget = Targets.set.contains(n)
                        val kind = when {
                            color == 1 -> Kind.BLUE              // azul: se ve pero nunca coincide
                            isTarget -> Kind.MATCH               // verde/desconocido + en lista
                            else -> Kind.GREEN
                        }
                        val prev = out[n]
                        if (prev == null || (kind == Kind.MATCH && prev.kind != Kind.MATCH)) {
                            out[n] = BikeResult(Rect(box), n, kind)
                        }
                    }
                }
                val w = bmp?.width ?: image.width
                val h = bmp?.height ?: image.height
                onResults(w, h, out.values.toList())
            }
            .addOnCompleteListener { image.close() }
    }

    /** 0 = verde, 1 = azul, 2 = desconocido */
    private fun classifyColor(bmp: Bitmap, r: Rect): Int {
        val pad = ((r.height()) * 0.7f).toInt()
        val x0 = max(0, r.left - pad); val x1 = min(bmp.width, r.right + pad)
        val y0 = max(0, r.top - pad); val y1 = min(bmp.height, r.bottom + pad)
        var greenN = 0; var blueN = 0
        val hsv = FloatArray(3)
        var y = y0
        while (y < y1) {
            var x = x0
            while (x < x1) {
                val inDigits = x in r.left..r.right && y in r.top..r.bottom
                if (!inDigits) {
                    Color.colorToHSV(bmp.getPixel(x, y), hsv)
                    val h = hsv[0]; val s = hsv[1]; val v = hsv[2]
                    if (s >= 0.30f && v >= 0.20f && v <= 0.97f) {
                        if (h in 70f..170f) greenN++ else if (h in 175f..265f) blueN++
                    }
                }
                x += 3
            }
            y += 3
        }
        return when {
            blueN > greenN * 1.2f && blueN > 12 -> 1
            greenN > blueN -> 0
            else -> 2
        }
    }

    private fun toUprightBitmap(image: ImageProxy, rot: Int): Bitmap? {
        return try {
            val nv21 = yuv420ToNv21(image)
            val yuv = YuvImage(nv21, ImageFormat.NV21, image.width, image.height, null)
            val os = ByteArrayOutputStream()
            yuv.compressToJpeg(Rect(0, 0, image.width, image.height), 80, os)
            val bytes = os.toByteArray()
            var bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            if (rot != 0) {
                val mtx = Matrix(); mtx.postRotate(rot.toFloat())
                bmp = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, mtx, true)
            }
            bmp
        } catch (e: Exception) { null }
    }

    private fun yuv420ToNv21(image: ImageProxy): ByteArray {
        val w = image.width; val h = image.height
        val ySize = w * h
        val nv21 = ByteArray(ySize + ySize / 2)
        val yP = image.planes[0]; val uP = image.planes[1]; val vP = image.planes[2]
        val yBuf = yP.buffer; val yStride = yP.rowStride
        if (yStride == w) { yBuf.get(nv21, 0, ySize) }
        else { for (row in 0 until h) { yBuf.position(row * yStride); yBuf.get(nv21, row * w, w) } }
        val cStride = vP.rowStride; val cPix = vP.pixelStride
        val vBuf = vP.buffer; val uBuf = uP.buffer
        val cw = w / 2; val ch = h / 2
        var off = ySize
        for (row in 0 until ch) {
            for (col in 0 until cw) {
                val idx = row * cStride + col * cPix
                nv21[off++] = vBuf.get(idx)
                nv21[off++] = uBuf.get(idx)
            }
        }
        return nv21
    }
}
