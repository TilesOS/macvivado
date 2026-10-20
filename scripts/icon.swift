import AppKit
let size = 1024
let image = NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:size,pixelsHigh:size,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep:image)
NSColor(calibratedRed:0.086,green:0.278,blue:0.431,alpha:1).setFill()
NSBezierPath(roundedRect:NSRect(x:44,y:44,width:936,height:936),xRadius:208,yRadius:208).fill()
NSColor(calibratedRed:0.63,green:0.82,blue:1,alpha:1).setStroke()
let pins=NSBezierPath();pins.lineWidth=25;pins.lineCapStyle = .round
for value in stride(from:350,through:674,by:108) {
    pins.move(to:NSPoint(x:value,y:220));pins.line(to:NSPoint(x:value,y:290))
    pins.move(to:NSPoint(x:value,y:734));pins.line(to:NSPoint(x:value,y:804))
    pins.move(to:NSPoint(x:220,y:value));pins.line(to:NSPoint(x:290,y:value))
    pins.move(to:NSPoint(x:734,y:value));pins.line(to:NSPoint(x:804,y:value))
}
pins.stroke()
NSColor(calibratedRed:0.94,green:0.97,blue:1,alpha:1).setStroke()
let chip=NSBezierPath(roundedRect:NSRect(x:290,y:290,width:444,height:444),xRadius:52,yRadius:52);chip.lineWidth=25;chip.stroke()
let wave=NSBezierPath();wave.lineWidth=29;wave.lineCapStyle = .round;wave.lineJoinStyle = .round
wave.move(to:NSPoint(x:365,y:450));wave.line(to:NSPoint(x:415,y:450));wave.line(to:NSPoint(x:415,y:590));wave.line(to:NSPoint(x:510,y:590));wave.line(to:NSPoint(x:510,y:450));wave.line(to:NSPoint(x:605,y:450));wave.line(to:NSPoint(x:605,y:590));wave.line(to:NSPoint(x:659,y:590));wave.stroke()
NSGraphicsContext.restoreGraphicsState()
try image.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:"resources/icon.png"))
