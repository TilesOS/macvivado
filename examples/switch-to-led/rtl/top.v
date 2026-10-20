// Switches 8 and 9 use LVCMOS18; see the board constraints.
module top(input wire [15:0] SW, output wire [15:0] LED);
    assign LED = SW;
endmodule
