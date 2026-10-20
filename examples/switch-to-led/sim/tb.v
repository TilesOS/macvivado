`timescale 1ns/1ps
module tb;
    reg [15:0] SW = 0;
    wire [15:0] LED;
    top dut(.SW(SW), .LED(LED));
    integer i;
    initial begin
        $dumpfile("wave.vcd"); $dumpvars(0, tb);
        for (i = 0; i < 65536; i = i + 257) begin
            SW = i; #10;
            if (LED !== SW) $fatal(1, "Switch mismatch: %h != %h", LED, SW);
        end
        $display("PASS: 256 switch patterns pass through unchanged"); $finish;
    end
endmodule
